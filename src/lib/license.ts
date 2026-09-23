import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { getConfig } from "./config.js";

/**
 * Public half of an Ed25519 keypair. The matching private key is held
 * outside this repository by TokenBurners and used (via
 * scripts/generate-license.mjs) to sign license keys offline - DevBuddy
 * never phones home to check a license, it just verifies the signature
 * locally. Anyone can read this public key; it can only verify licenses,
 * never create them.
 */
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA14fh4TdODtxnWDZ7s6BS9XGwwYUh71zNPcaOUG1StHA=
-----END PUBLIC KEY-----
`;

export interface LicensePayload {
  plan: "pro";
  iss: "tokenburners";
  iat: number; // issued-at, epoch seconds
  exp?: number; // optional expiry, epoch seconds
  sub?: string; // optional licensee identifier (email, order id, ...)
}

export type LicenseCheckResult =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: string };

function base64UrlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

export function verifyLicenseKey(licenseKey: string): LicenseCheckResult {
  const parts = licenseKey.trim().split(".");
  if (parts.length !== 2) return { valid: false, reason: "Malformed license key (expected <payload>.<signature>)" };

  const [payloadPart, signaturePart] = parts;
  let payload: LicensePayload;
  try {
    payload = JSON.parse(base64UrlToBuffer(payloadPart).toString("utf-8"));
  } catch {
    return { valid: false, reason: "Malformed license payload" };
  }

  let signatureValid: boolean;
  try {
    const publicKey = createPublicKey(LICENSE_PUBLIC_KEY_PEM);
    signatureValid = cryptoVerify(null, base64UrlToBuffer(payloadPart), publicKey, base64UrlToBuffer(signaturePart));
  } catch {
    return { valid: false, reason: "Malformed license signature" };
  }

  if (!signatureValid) return { valid: false, reason: "Invalid signature - this license key was not issued by TokenBurners" };
  if (payload.exp && Date.now() / 1000 > payload.exp) return { valid: false, reason: "License key has expired" };

  return { valid: true, payload };
}

export type Plan = "free" | "pro";

export function getPlan(): Plan {
  const { licenseKey } = getConfig();
  if (!licenseKey) return "free";
  const result = verifyLicenseKey(licenseKey);
  return result.valid ? "pro" : "free";
}
