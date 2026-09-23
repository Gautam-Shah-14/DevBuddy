#!/usr/bin/env node
/**
 * Maintainer-only tool to issue signed DevBuddy Pro license keys.
 *
 * Requires the Ed25519 PRIVATE key that matches the public key embedded in
 * src/lib/license.ts. That private key is NOT committed to this repo -
 * keep it somewhere safe (password manager / secrets vault), never in git.
 *
 * Usage:
 *   LICENSE_PRIVATE_KEY_FILE=/path/to/private.pem \
 *     node scripts/generate-license.mjs --sub "customer@example.com" [--days 365]
 */
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";

function parseArgs(argv) {
  const args = { days: undefined, sub: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--days") args.days = Number(argv[++i]);
    else if (argv[i] === "--sub") args.sub = argv[++i];
  }
  return args;
}

function base64Url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const keyFile = process.env.LICENSE_PRIVATE_KEY_FILE;
if (!keyFile) {
  console.error("Set LICENSE_PRIVATE_KEY_FILE to the path of the Ed25519 private key PEM.");
  process.exit(1);
}

const { days, sub } = parseArgs(process.argv.slice(2));
const privateKey = createPrivateKey(readFileSync(keyFile, "utf-8"));

const payload = {
  plan: "pro",
  iss: "tokenburners",
  iat: Math.floor(Date.now() / 1000),
  ...(days ? { exp: Math.floor(Date.now() / 1000) + days * 86400 } : {}),
  ...(sub ? { sub } : {}),
};

const payloadBuf = Buffer.from(JSON.stringify(payload), "utf-8");
const signature = sign(null, payloadBuf, privateKey);

console.log(`${base64Url(payloadBuf)}.${base64Url(signature)}`);
