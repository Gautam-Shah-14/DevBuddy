import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addConnector } from "../src/lib/connectors.js";
import { setAutoApprove } from "../src/lib/permissions.js";
import { McpManager } from "../src/lib/mcp.js";

function withTempProject<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-mcp-"));
  try {
    return fn(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function captureConsoleError(): { errors: string[]; restore: () => void } {
  const original = console.error;
  const errors: string[] = [];
  console.error = (msg: string) => errors.push(String(msg));
  return { errors, restore: () => (console.error = original) };
}

test("connectAll never spawns the connector's process when mcp_connect permission is refused", () =>
  withTempProject(async (projectRoot) => {
    setAutoApprove(false); // non-interactive test process (no TTY) => permission is auto-refused

    // A command that, if actually spawned, would succeed instantly - proving
    // that any failure we see instead came from the permission gate, not the spawn.
    addConnector({ name: "should-not-run", command: "true", args: [], enabled: true }, projectRoot);

    const capture = captureConsoleError();
    let tools;
    try {
      const manager = new McpManager();
      tools = await manager.connectAll(projectRoot);
    } finally {
      capture.restore();
    }

    assert.deepEqual(tools, []);
    assert.match(capture.errors.join("\n"), /non-interactive session/);
    assert.match(capture.errors.join("\n"), /mcp_connect/);
  }));

test("connectAll mentions the project's shared connectors.json in the permission description for a shared connector", () =>
  withTempProject(async (projectRoot) => {
    setAutoApprove(false);
    addConnector({ name: "shared-conn", command: "true", args: [], enabled: true }, projectRoot);

    const capture = captureConsoleError();
    try {
      const manager = new McpManager();
      await manager.connectAll(projectRoot);
    } finally {
      capture.restore();
    }

    assert.match(capture.errors.join("\n"), /shared \.devbuddy\/connectors\.json/);
  }));

test("connectAll proceeds to actually attempt the connection once mcp_connect permission is auto-approved", () =>
  withTempProject(async (projectRoot) => {
    setAutoApprove(true);
    addConnector(
      { name: "nonexistent-binary", command: "devbuddy-test-nonexistent-binary-xyz", args: [], enabled: true },
      projectRoot
    );

    const capture = captureConsoleError();
    let tools;
    try {
      const manager = new McpManager();
      tools = await manager.connectAll(projectRoot);
    } finally {
      capture.restore();
      setAutoApprove(false);
    }

    assert.deepEqual(tools, []);
    // Past the permission gate, the failure now comes from actually trying to
    // spawn the (nonexistent) binary, not from a permission refusal.
    assert.doesNotMatch(capture.errors.join("\n"), /non-interactive session/);
    assert.match(capture.errors.join("\n"), /Failed to connect to MCP server "nonexistent-binary"/);
  }));
