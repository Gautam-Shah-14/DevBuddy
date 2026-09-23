import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectVerifyCommand, runVerification } from "../src/lib/verify.js";

async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "devbuddy-verify-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('detectVerifyCommand returns "off" as a hard disable, ignoring any package.json', async () => {
  await withTempDir((dir) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    assert.equal(detectVerifyCommand(dir, "off"), null);
  });
});

test("detectVerifyCommand prefers an explicitly configured command", async () => {
  await withTempDir((dir) => {
    assert.equal(detectVerifyCommand(dir, "npm run build"), "npm run build");
  });
});

test("detectVerifyCommand auto-detects npm test from a real test script", async () => {
  await withTempDir((dir) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    assert.equal(detectVerifyCommand(dir, ""), "npm test");
  });
});

test('detectVerifyCommand ignores the npm-init placeholder ("no test specified")', async () => {
  await withTempDir((dir) => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } })
    );
    assert.equal(detectVerifyCommand(dir, ""), null);
  });
});

test("detectVerifyCommand returns null with no package.json", async () => {
  await withTempDir((dir) => {
    assert.equal(detectVerifyCommand(dir, ""), null);
  });
});

test("runVerification reports passed:true and captures stdout for a successful command", async () => {
  await withTempDir(async (dir) => {
    const result = await runVerification(dir, "echo hi");
    assert.equal(result.passed, true);
    assert.match(result.output, /hi/);
  });
});

test("runVerification reports passed:false and captures output for a failing command", async () => {
  await withTempDir(async (dir) => {
    const result = await runVerification(dir, "node -e \"console.log('boom');process.exit(1)\"");
    assert.equal(result.passed, false);
    assert.match(result.output, /boom/);
  });
});
