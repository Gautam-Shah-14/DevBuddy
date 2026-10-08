"""Custom Presidio recognizers for PII/secret shapes the default recognizer set doesn't cover.

The structural shapes (regex) and validators (Luhn, Verhoeff, PAN holder-type, GSTIN checksum)
are ported from DevBuddy's own earlier TypeScript guardrails engine. The validators cut false
positives on digit strings that merely happen to fit a shape (an arbitrary 12-digit number is
not an Aadhaar number unless its Verhoeff check digit also matches).
"""

from __future__ import annotations

from typing import List, Optional

from presidio_analyzer import Pattern, PatternRecognizer


def _luhn_check(value: str) -> bool:
    digits = [c for c in value if c.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    total = 0
    double = False
    for ch in reversed(digits):
        d = int(ch)
        if double:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        double = not double
    return total % 10 == 0


# Verhoeff checksum tables - the algorithm UIDAI uses for the Aadhaar check digit.
_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def _verhoeff_check(value: str) -> bool:
    """Validates a 12-digit Aadhaar number's Verhoeff check digit."""
    digits = [c for c in value if c.isdigit()]
    if len(digits) != 12:
        return False
    if digits[0] in ("0", "1"):  # Aadhaar never starts with 0 or 1
        return False
    c = 0
    for i, d in enumerate(reversed(digits)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][int(d)]]
    return c == 0


# Valid 4th-character holder-type codes in a PAN (individual, company, HUF, firm, trust, etc.).
_PAN_HOLDER_TYPES = set("PCHABGJLFT")


def _pan_check(value: str) -> bool:
    v = value.strip().upper()
    return len(v) >= 4 and v[3] in _PAN_HOLDER_TYPES


_GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _gstin_checksum(value: str) -> bool:
    """Validates a GSTIN's mod-36 check character (the same algorithm GSTN itself uses)."""
    v = value.strip().upper()
    if len(v) != 15:
        return False
    mod = len(_GSTIN_CHARSET)
    factor = 2
    total = 0
    for ch in reversed(v[:14]):
        code_point = _GSTIN_CHARSET.find(ch)
        if code_point == -1:
            return False
        digit = factor * code_point
        factor = 1 if factor == 2 else 2
        digit = digit // mod + digit % mod
        total += digit
    checksum_index = (mod - (total % mod)) % mod
    return _GSTIN_CHARSET[checksum_index] == v[14]


def _gstin_check(value: str) -> bool:
    """A GSTIN embeds a PAN at positions 2-11, so its holder-type character (position 5) must
    also be valid."""
    v = value.strip().upper()
    return len(v) == 15 and v[5] in _PAN_HOLDER_TYPES and _gstin_checksum(v)


class _ValidatedPatternRecognizer(PatternRecognizer):
    """A PatternRecognizer whose match must also pass a structural checksum - cuts false
    positives on digit strings that merely fit the shape (e.g. a random 12-digit number is
    not an Aadhaar number unless its Verhoeff check digit also matches)."""

    _validator: staticmethod

    def validate_result(self, pattern_text: str) -> Optional[bool]:
        return self._validator(pattern_text)


class AadhaarRecognizer(_ValidatedPatternRecognizer):
    _validator = staticmethod(_verhoeff_check)

    def __init__(self):
        super().__init__(
            supported_entity="IN_AADHAAR",
            name="Aadhaar Recognizer",
            patterns=[Pattern("Aadhaar (12 digit)", r"\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b", 0.4)],
            context=["aadhaar", "aadhar", "uidai"],
        )


class PanRecognizer(_ValidatedPatternRecognizer):
    _validator = staticmethod(_pan_check)

    def __init__(self):
        super().__init__(
            supported_entity="IN_PAN",
            name="PAN Recognizer",
            patterns=[Pattern("PAN (10 char)", r"\b[A-Z]{5}\d{4}[A-Z]\b", 0.4)],
            context=["pan", "permanent account number", "income tax"],
        )


class GstinRecognizer(_ValidatedPatternRecognizer):
    _validator = staticmethod(_gstin_check)

    def __init__(self):
        super().__init__(
            supported_entity="IN_GSTIN",
            name="GSTIN Recognizer",
            patterns=[Pattern("GSTIN (15 char)", r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b", 0.4)],
            context=["gstin", "gst", "goods and services tax"],
        )


class AwsAccessKeyRecognizer(PatternRecognizer):
    def __init__(self):
        super().__init__(
            supported_entity="AWS_ACCESS_KEY",
            name="AWS Access Key Recognizer",
            patterns=[Pattern("AWS Access Key ID", r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b", 0.85)],
        )


class PrivateKeyRecognizer(PatternRecognizer):
    def __init__(self):
        super().__init__(
            supported_entity="PRIVATE_KEY",
            name="Private Key Recognizer",
            patterns=[Pattern(
                "PEM private key block",
                r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
                0.95,
            )],
        )


class JwtRecognizer(PatternRecognizer):
    def __init__(self):
        super().__init__(
            supported_entity="JWT",
            name="JWT Recognizer",
            patterns=[Pattern(
                "JWT", r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", 0.85,
            )],
        )


class GenericSecretRecognizer(PatternRecognizer):
    def __init__(self):
        super().__init__(
            supported_entity="GENERIC_SECRET",
            name="Generic Secret Recognizer",
            patterns=[Pattern(
                "key/token/password assignment",
                r"\b(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['\"]?[A-Za-z0-9_\-./+]{8,}['\"]?",
                0.6,
            )],
        )


class CreditCardLuhnRecognizer(_ValidatedPatternRecognizer):
    """Presidio ships a CREDIT_CARD recognizer too, but it's context-weighted (needs a nearby
    word like "card"); this one is a plain Luhn-validated shape match, matching the old engine's
    unconditional behavior."""

    _validator = staticmethod(_luhn_check)

    def __init__(self):
        super().__init__(
            supported_entity="CREDIT_CARD",
            name="Credit Card (Luhn) Recognizer",
            patterns=[Pattern("Credit card (13-19 digit, Luhn)", r"\b(?:\d[ -]?){13,19}\b", 0.3)],
        )


def build_custom_recognizers() -> List[PatternRecognizer]:
    """All custom recognizers this plugin adds on top of Presidio's own defaults."""
    return [
        AadhaarRecognizer(), PanRecognizer(), GstinRecognizer(), AwsAccessKeyRecognizer(),
        PrivateKeyRecognizer(), JwtRecognizer(), GenericSecretRecognizer(), CreditCardLuhnRecognizer(),
    ]


# Presidio built-ins we want, scoped away from the noisy country-specific extras (UK_NHS,
# US_BANK_NUMBER, US_DRIVER_LICENSE, URL, ...) that fire on bare digit strings with no actual
# evidence they're that specific thing - confirmed via a real run misclassifying a 10-digit
# Indian phone number as UK_NHS. The custom entities above are always included regardless of
# this list (they're not in Presidio's default registry at all).
DEFAULT_PRESIDIO_ENTITIES = [
    "EMAIL_ADDRESS", "PHONE_NUMBER", "US_SSN", "CREDIT_CARD", "IP_ADDRESS", "LOCATION",
]

CUSTOM_ENTITIES = [
    "IN_AADHAAR", "IN_PAN", "IN_GSTIN", "AWS_ACCESS_KEY", "PRIVATE_KEY", "JWT", "GENERIC_SECRET",
]
