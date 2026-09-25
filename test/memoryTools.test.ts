import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rememberTool } from "../src/tools/memoryTools.js";
import { readProjectNotes } from "../src/lib/notes.js";
import { ProjectMemory } from "../src/lib/memory.js";
import { ensureProject } from "../src/lib/project.js";
import type { ToolContext } from "../src/tools/types.js";

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-memorytools-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

function buildContext(projectRoot: string, memory: ProjectMemory, sessionId: number): ToolContext {
  return { projectRoot, projectPaths: ensureProject(projectRoot), memory, sessionId, skills: [] };
}

test("remember appends the note to this project's notes file", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      const result = await rememberTool.execute({ note: "this project has no git repo" }, ctx);
      assert.equal(result, "Remembered.");
      assert.match(readProjectNotes(ctx.projectPaths.notesFile), /this project has no git repo/);
    } finally {
      memory.close();
    }
  }));

test("remember rejects an empty note without writing anything", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      const result = await rememberTool.execute({ note: "   " }, ctx);
      assert.match(result, /error/i);
      assert.equal(readProjectNotes(ctx.projectPaths.notesFile), "");
    } finally {
      memory.close();
    }
  }));
