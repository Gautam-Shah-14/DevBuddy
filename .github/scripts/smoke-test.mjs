// Cross-platform smoke test for the built CLI, run in CI on Linux/macOS/Windows.
// Written as plain Node rather than shell commands so it behaves identically
// regardless of the runner's default shell (bash vs cmd.exe vs PowerShell).
import { exec } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execAsync = promisify(exec);

// 1) run_shell relies on child_process.exec picking the OS's default shell
// automatically (no hardcoded /bin/sh, which doesn't exist on Windows).
const { stdout } = await execAsync("echo devbuddy-smoke-test");
assert.match(stdout, /devbuddy-smoke-test/);
console.log(`[ok] shell execution works on ${process.platform}`);

// 2) search_files, including its pure-Node fallback tier (used when neither
// ripgrep nor grep are on PATH - the normal case on stock Windows).
const { searchFilesTool } = await import("../../dist/tools/searchTools.js");
const dir = mkdtempSync(join(tmpdir(), "devbuddy-smoke-"));
try {
  writeFileSync(join(dir, "sample.ts"), "const needle = 'smoke-test-value';\n");
  const result = await searchFilesTool.execute({ pattern: "smoke-test-value" }, { projectRoot: dir });
  assert.match(result, /smoke-test-value/);
  console.log(`[ok] search_files works on ${process.platform}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`All smoke tests passed on ${process.platform}`);
