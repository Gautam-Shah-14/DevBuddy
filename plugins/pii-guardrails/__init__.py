"""pii-guardrails plugin - masks/blocks PII and secrets in outgoing messages before they
reach the AI provider.

``llm_request`` middleware masks ``api_kwargs["messages"]`` right before the provider call;
``transform_llm_output`` restores the placeholders in the model's reply before it's shown or
stored. One :class:`PiiGuardrailsEngine` per session, so a placeholder minted in turn 1 still
restores correctly if the model echoes it back in turn 5.

Off by default (``security.pii_guardrails_mode: "off"``); this module does not import Presidio
until a session actually turns a mode on.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Dict, Optional

from .engine import GuardrailsMode, GuardrailsUnavailable, PiiGuardrailsEngine

logger = logging.getLogger(__name__)

_engines: Dict[str, PiiGuardrailsEngine] = {}
_engines_lock = threading.Lock()
_warned_unavailable = False


def _configured_mode() -> GuardrailsMode:
    try:
        from devbuddy_cli.config import load_config_readonly

        mode = (load_config_readonly().get("security") or {}).get("pii_guardrails_mode", "off")
    except Exception:
        mode = "off"
    return mode if mode in ("off", "mask", "block") else "off"


def _engine_for_session(session_id: str, mode: GuardrailsMode) -> PiiGuardrailsEngine:
    with _engines_lock:
        engine = _engines.get(session_id)
        if engine is None or engine.mode != mode:
            engine = PiiGuardrailsEngine(mode)
            _engines[session_id] = engine
        return engine


def _on_llm_request(request: Optional[Dict[str, Any]] = None, session_id: str = "", **_: Any) -> Optional[Dict[str, Any]]:
    global _warned_unavailable
    mode = _configured_mode()
    if mode == "off" or not isinstance(request, dict):
        return None
    messages = request.get("messages")
    if not isinstance(messages, list):
        return None
    engine = _engine_for_session(session_id or "default", mode)
    try:
        new_messages = engine.apply(messages)
    except GuardrailsUnavailable as exc:
        if not _warned_unavailable:
            logger.warning("pii-guardrails: %s (running this and future turns without it)", exc)
            _warned_unavailable = True
        return None
    return {"request": {**request, "messages": new_messages}}


def _on_transform_llm_output(response_text: str = "", session_id: str = "", **_: Any) -> Optional[str]:
    with _engines_lock:
        engine = _engines.get(session_id or "default")
    if engine is None:
        return None
    if engine.blocked_this_call:
        types_seen = ", ".join(sorted(engine._type_counters.keys())) or "sensitive content"
        return (
            f"Blocked: your last message looked like it contained {types_seen}. "
            "Nothing was sent to the AI provider. Remove it, or switch modes with "
            "`devbuddy config set security.pii_guardrails_mode mask`, and try again."
        )
    try:
        restored = engine.restore(response_text)
    except Exception as exc:  # pragma: no cover - restore() is pure string ops, defensive only
        logger.warning("pii-guardrails: restore failed (%s); showing the masked text as-is", exc)
        return None
    return restored if restored != response_text else None


def register(ctx) -> None:
    ctx.register_middleware("llm_request", _on_llm_request)
    ctx.register_hook("transform_llm_output", _on_transform_llm_output)
