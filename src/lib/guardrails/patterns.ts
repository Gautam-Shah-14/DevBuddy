/**
 * Structured PII / secret detection patterns. Regex shapes for the common
 * PII types (email, phone, SSN, credit card, IP, street address) are
 * adapted from redact-pii (github.com/solvvy/redact-pii, MIT), whose
 * patterns have been battle-tested in production for years. The
 * secret-shaped patterns (AWS keys, private key blocks, JWTs, generic
 * key/token assignments) are DevBuddy's own addition, since code/config
 * files are DevBuddy's primary scan target rather than email text.
 */
export interface PiiPattern {
  type: string;
  regex: RegExp;
  /** Optional extra validation to cut false positives (e.g. Luhn check). */
  validate?: (match: string) => boolean;
}

function luhnCheck(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export const PII_PATTERNS: PiiPattern[] = [
  { type: "EMAIL", regex: /[a-z0-9_.+-]+@[a-z0-9-]+\.[a-z0-9.-]+/gi },
  {
    type: "PHONE",
    regex: /(\(?\+?\d{1,2}\)?[-. ]?)?(\(?\d{3}\)?[-. ]?)\d{3}[-. ]?\d{4}\b/g,
  },
  { type: "SSN", regex: /\b\d{3}[ -]\d{2}[ -]\d{4}\b/g },
  {
    type: "CREDIT_CARD",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    validate: luhnCheck,
  },
  { type: "IP_ADDRESS", regex: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g },
  {
    type: "STREET_ADDRESS",
    regex: /\b\d+\s+([A-Za-z]+\s){1,3}(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd)\.?\b/gi,
  },
  { type: "AWS_ACCESS_KEY", regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    type: "PRIVATE_KEY",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { type: "JWT", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  {
    type: "GENERIC_SECRET",
    regex: /\b(api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+]{8,}['"]?/gi,
  },
];
