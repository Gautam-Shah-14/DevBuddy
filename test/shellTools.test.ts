import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runShellTool } from "../src/tools/shellTools.js";
import { setAutoApprove } from "../src/lib/permissions.js";
import { ProjectMemory } from "../src/lib/memory.js";
import { ensureProject } from "../src/lib/project.js";
import type { ToolContext } from "../src/tools/types.js";

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-shelltools-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

function buildContext(projectRoot: string, memory: ProjectMemory, sessionId: number): ToolContext {
  return { projectRoot, projectPaths: ensureProject(projectRoot), memory, sessionId, skills: [] };
}

test("run_shell refuses a hardline-dangerous command even with --yes/auto-approve, never reaching the permission prompt", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    setAutoApprove(true); // simulates `devbuddy run --yes` - should make no difference here
    try {
      const result = await runShellTool.execute({ command: "rm -rf /" }, buildContext(projectRoot, memory, sessionId));
      assert.match(result, /refusing to run this command/i);
      assert.match(result, /root filesystem/i);
      assert.match(result, /cannot be approved/i);
    } finally {
      setAutoApprove(false);
      memory.close();
    }
  }));

test("run_shell still runs an ordinary command normally (auto-approved)", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    setAutoApprove(true);
    try {
      const result = await runShellTool.execute({ command: "echo hello" }, buildContext(projectRoot, memory, sessionId));
      assert.match(result, /hello/);
    } finally {
      setAutoApprove(false);
      memory.close();
    }
  }));
