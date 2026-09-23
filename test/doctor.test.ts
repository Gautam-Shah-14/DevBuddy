import { test } from "node:test";
import assert from "node:assert/strict";
import { setConfigValue } from "../src/lib/config.js";
import { checkNode, checkLicense } from "../src/commands/doctor.js";

test("checkNode passes on the Node version running the test suite (guaranteed >= 18)", () => {
  const result = checkNode();
  assert.equal(result.status, "ok");
  assert.match(result.detail, /^v\d+\./);
});

test("checkLicense reports the guardrails mode when it's not off", () => {
  setConfigValue("guardrailsMode", "mask");
  const result = checkLicense();
  assert.equal(result.status, "ok");
  assert.match(result.detail, /guardrails: mask/);
  setConfigValue("guardrailsMode", "off");
});

test("checkLicense omits the guardrails detail when it's off", () => {
  setConfigValue("guardrailsMode", "off");
  const result = checkLicense();
  assert.doesNotMatch(result.detail, /guardrails/);
});
