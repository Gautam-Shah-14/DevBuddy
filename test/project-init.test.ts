import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectCommand } from "../src/commands/project.js";

function withTempProject<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-project-init-"));
  try {
    return fn(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("project init scaffolds .devbuddy/ with a README, skills dir, and connectors.json", () =>
  withTempProject((projectRoot) => {
    projectCommand(["init"], projectRoot);

    const dir = join(projectRoot, ".devbuddy");
    assert.ok(existsSync(join(dir, "README.md")));
    assert.ok(existsSync(join(dir, "skills")));
    assert.ok(existsSync(join(dir, "connectors.json")));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "connectors.json"), "utf-8")), []);
  }));

test("project init does not clobber an existing connectors.json", () =>
  withTempProject((projectRoot) => {
    projectCommand(["init"], projectRoot);
    const connectorsPath = join(projectRoot, ".devbuddy", "connectors.json");
    writeFileSync(connectorsPath, JSON.stringify([{ name: "keep-me", command: "x", args: [], enabled: true }]));

    projectCommand(["init"], projectRoot); // running init again should be a no-op for existing files

    const raw = JSON.parse(readFileSync(connectorsPath, "utf-8"));
    assert.equal(raw[0].name, "keep-me");
  }));

test("project init README documents the safe config keys and warns against secrets", () =>
  withTempProject((projectRoot) => {
    projectCommand(["init"], projectRoot);
    const readme = readFileSync(join(projectRoot, ".devbuddy", "README.md"), "utf-8");
    assert.match(readme, /Never put a secret/i);
    assert.match(readme, /provider/);
    assert.match(readme, /verifyCommand/);
  }));

test("project command rejects an unknown action", () =>
  withTempProject((projectRoot) => {
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (msg: string) => errors.push(String(msg));
    try {
      projectCommand(["bogus"], projectRoot);
    } finally {
      console.error = originalError;
      process.exitCode = 0; // projectCommand sets this on failure; don't leak it to the test runner's own exit code
    }
    assert.match(errors.join("\n"), /Usage/);
  }));
