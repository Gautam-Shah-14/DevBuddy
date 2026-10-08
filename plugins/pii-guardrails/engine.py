"""PII/secret scanning of outgoing messages before they reach the AI provider.

Separate from (and upstream of) ``agent/redact.py``'s egress scrubbing: that module protects
Hermes's own monitoring data and the agent's own replies on their way OUT to a chat platform.
This module protects the USER's prompt content on its way to the model provider - the boundary
DevBuddy's own earlier TypeScript guardrails engine covered, ported here onto Presidio.

Lazy by design: Presidio + its spaCy model cost real memory and ~1-2s to load, so nothing here
runs until a session actually turns on ``security.pii_guardrails_mode``.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Dict, List, Literal, Optional, Tuple

logger = logging.getLogger(__name__)

GuardrailsMode = Literal["off", "mask", "block"]

_BLOCKED_REFUSAL_FOR_MODEL = (
    "[This message was withheld by DevBuddy's PII guardrails before it reached you. "
    "Reply with exactly: I can't help with that right now - it looks like your last message "
    "contained personal or sensitive information, and guardrails are set to block mode. "
    "Remove it, or switch modes with `devbuddy config set security.pii_guardrails_mode mask`, "
    "and try again. Do not guess what the redacted content might have been.]"
)


class GuardrailsUnavailable(Exception):
    """Presidio/guardrails-ai aren't installed. Caught by the plugin wrapper, which logs once
    and runs the turn through unmodified rather than failing it."""


def _analyzer_and_recognizers():
    """Build (and cache) the Presidio AnalyzerEngine plus this plugin's custom recognizers.

    Built once per process on first real use - not at plugin-load time, so a session that never
    turns guardrails on never pays Presidio/spaCy's import and model-load cost.
    """
    global _analyzer, _custom_recognizers
    if _analyzer is not None:
        return _analyzer, _custom_recognizers
    try:
        from presidio_analyzer import AnalyzerEngine

        from . import patterns
    except ImportError as exc:
        raise GuardrailsUnavailable(
            "PII guardrails need Presidio + a spaCy model - run: pip install -e '.[guardrails]'"
        ) from exc
    try:
        _analyzer = AnalyzerEngine()
    except Exception as exc:
        raise GuardrailsUnavailable(f"Could not initialize the PII analyzer: {exc}") from exc
    _custom_recognizers = patterns.build_custom_recognizers()
    return _analyzer, _custom_recognizers


_analyzer: Optional[Any] = None
_custom_recognizers: Optional[List[Any]] = None
_init_lock = threading.Lock()


def _wanted_entities() -> List[str]:
    from . import patterns

    return patterns.DEFAULT_PRESIDIO_ENTITIES + patterns.CUSTOM_ENTITIES


def scan_text(text: str) -> List[Tuple[str, str, int, int]]:
    """Returns ``[(entity_type, matched_value, start, end), ...]`` for one string. Raises
    GuardrailsUnavailable if Presidio isn't installed."""
    if not text:
        return []
    with _init_lock:
        analyzer, custom_recognizers = _analyzer_and_recognizers()
    results = analyzer.analyze(
        text=text, language="en", entities=_wanted_entities(), ad_hoc_recognizers=custom_recognizers,
    )
    # Presidio's own overlap resolution already drops lower-confidence overlapping spans within
    # one analyze() call; sort by position so masking (longest-first, see below) stays stable.
    return sorted(
        ((r.entity_type, text[r.start:r.end], r.start, r.end) for r in results),
        key=lambda t: t[2],
    )


class PiiGuardrailsEngine:
    """One instance per session (created lazily, kept for the session's lifetime so a value
    masked in turn 1 still maps to the same placeholder in turn 5 - otherwise an AI reply that
    echoes an earlier placeholder back couldn't be restored)."""

    def __init__(self, mode: GuardrailsMode):
        self.mode: GuardrailsMode = mode
        self._value_to_placeholder: Dict[str, str] = {}
        self._placeholder_to_value: Dict[str, str] = {}
        self._type_counters: Dict[str, int] = {}
        self._blocked_this_call = False

    def _placeholder_for(self, entity_type: str, value: str) -> str:
        existing = self._value_to_placeholder.get(value)
        if existing:
            return existing
        count = self._type_counters.get(entity_type, 0) + 1
        self._type_counters[entity_type] = count
        placeholder = f"⟦{entity_type}_{count}⟧"  # ⟦TYPE_n⟧
        self._value_to_placeholder[value] = placeholder
        self._placeholder_to_value[placeholder] = value
        return placeholder

    def _mask_text(self, text: str) -> str:
        findings = scan_text(text)
        masked = text
        # Longest value first so a shorter match that happens to be a substring of a longer one
        # (e.g. a bare phone number inside a longer digit run) doesn't corrupt it.
        for entity_type, value, _start, _end in sorted(findings, key=lambda f: len(f[1]), reverse=True):
            masked = masked.replace(value, self._placeholder_for(entity_type, value))
        return masked, bool(findings)

    def restore(self, text: Optional[str]) -> Optional[str]:
        """Replace this engine's placeholders with their real values. Safe to call even when
        nothing was ever masked (returns ``text`` unchanged)."""
        if not text:
            return text
        restored = text
        for placeholder, value in self._placeholder_to_value.items():
            restored = restored.replace(placeholder, value)
        return restored

    def apply(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Returns a new messages list safe to send to the provider. In "block" mode, a message
        containing PII is replaced with a short refusal instruction instead of its real content
        (never sent as-is) and ``self._blocked_this_call`` is set so the caller can swap the
        model's reply for a clear refusal once it comes back. Returns ``messages`` unchanged
        (same objects) when mode is "off" or nothing is found."""
        self._blocked_this_call = False
        if self.mode == "off":
            return messages

        any_findings = False
        new_messages: List[Dict[str, Any]] = []
        for message in messages:
            content = message.get("content")
            if not isinstance(content, str) or not content:
                new_messages.append(message)
                continue
            masked, found = self._mask_text(content)
            if found:
                any_findings = True
            new_messages.append({**message, "content": masked})

        if self.mode == "block" and any_findings:
            self._blocked_this_call = True
            return [
                {"role": m.get("role", "user"), "content": _BLOCKED_REFUSAL_FOR_MODEL}
                if m is new_messages[-1] and m.get("role") == "user"
                else m
                for m in new_messages
            ]
        return new_messages

    @property
    def blocked_this_call(self) -> bool:
        return self._blocked_this_call
