import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInSandbox, SandboxViolation } from "../src/lib/sandbox.js";

function withTempDirs<T>(fn: (projectRoot: string, outsideDir: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-sandbox-project-"));
  const outsideDir = mkdtempSync(join(tmpdir(), "devbuddy-sandbox-outside-"));
  try {
    return fn(projectRoot, outsideDir);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  }
}

test("resolveInSandbox allows a normal relative path inside the project", () =>
  withTempDirs((projectRoot) => {
    const resolved = resolveInSandbox(projectRoot, "src/index.ts");
    assert.equal(resolved, join(projectRoot, "src/index.ts"));
  }));

test("resolveInSandbox allows a not-yet-existing file inside a real (non-symlink) subdirectory", () =>
  withTempDirs((projectRoot) => {
    mkdirSync(join(projectRoot, "sub"));
    const resolved = resolveInSandbox(projectRoot, "sub/new-file.txt");
    assert.equal(resolved, join(projectRoot, "sub/new-file.txt"));
  }));

test("resolveInSandbox rejects a '..' escape", () =>
  withTempDirs((projectRoot) => {
    assert.throws(() => resolveInSandbox(projectRoot, "../outside.txt"), SandboxViolation);
  }));

test("resolveInSandbox rejects an absolute path outside the project", () =>
  withTempDirs((projectRoot, outsideDir) => {
    assert.throws(() => resolveInSandbox(projectRoot, join(outsideDir, "secret.txt")), SandboxViolation);
  }));

test("resolveInSandbox rejects a symlink inside the project that points to a file outside it", () =>
  withTempDirs((projectRoot, outsideDir) => {
    const secretPath = join(outsideDir, "secret.txt");
    writeFileSync(secretPath, "top secret");
    const linkPath = join(projectRoot, "innocuous-looking-file.txt");
    symlinkSync(secretPath, linkPath);

    assert.throws(() => resolveInSandbox(projectRoot, "innocuous-looking-file.txt"), SandboxViolation);
  }));

test("resolveInSandbox rejects a symlinked directory inside the project that points outside it, even for a not-yet-existing file within it", () =>
  withTempDirs((projectRoot, outsideDir) => {
    const linkedDir = join(projectRoot, "linked-dir");
    symlinkSync(outsideDir, linkedDir);

    assert.throws(() => resolveInSandbox(projectRoot, "linked-dir/new-file.txt"), SandboxViolation);
  }));

test("resolveInSandbox still allows a symlink that points to another location inside the project", () =>
  withTempDirs((projectRoot) => {
    mkdirSync(join(projectRoot, "real-dir"));
    writeFileSync(join(projectRoot, "real-dir", "file.txt"), "hi");
    symlinkSync(join(projectRoot, "real-dir"), join(projectRoot, "linked-dir"));

    const resolved = resolveInSandbox(projectRoot, "linked-dir/file.txt");
    assert.equal(resolved, join(projectRoot, "linked-dir/file.txt"));
  }));
