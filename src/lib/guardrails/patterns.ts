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

// Verhoeff checksum tables - the algorithm UIDAI uses for the Aadhaar check digit.
const VERHOEFF_D = [
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
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Validates a 12-digit Aadhaar number's Verhoeff check digit, cutting false positives on arbitrary 12-digit numbers. */
function verhoeffCheck(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 12) return false;
  if (digits[0] === "0" || digits[0] === "1") return false; // Aadhaar never starts with 0 or 1
  let c = 0;
  const reversed = digits.split("").reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

/** Valid 4th-character holder-type codes in a PAN (individual, company, HUF, firm, trust, etc.). */
const PAN_HOLDER_TYPES = new Set(["P", "C", "H", "A", "B", "G", "J", "L", "F", "T"]);

function panCheck(value: string): boolean {
  return PAN_HOLDER_TYPES.has(value[3]?.toUpperCase());
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
    type: "AADHAAR",
    regex: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
    validate: verhoeffCheck,
  },
  {
    type: "PAN",
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    validate: panCheck,
  },
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
