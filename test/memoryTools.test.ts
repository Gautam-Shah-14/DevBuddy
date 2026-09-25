import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rememberTool } from "../src/tools/memoryTools.js";
import { renderProjectNotes } from "../src/lib/notes.js";
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

test("remember action 'add' appends the note to this project's notes file", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      const result = await rememberTool.execute({ action: "add", note: "this project has no git repo" }, ctx);
      assert.equal(result, "Remembered.");
      assert.match(renderProjectNotes(ctx.projectPaths.notesFile), /this project has no git repo/);
    } finally {
      memory.close();
    }
  }));

test("remember defaults to action 'add' when none is given", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      const result = await rememberTool.execute({ note: "a fact" }, ctx);
      assert.equal(result, "Remembered.");
    } finally {
      memory.close();
    }
  }));

test("remember action 'add' rejects an empty note without writing anything", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      const result = await rememberTool.execute({ action: "add", note: "   " }, ctx);
      assert.match(result, /error/i);
      assert.equal(renderProjectNotes(ctx.projectPaths.notesFile), "");
    } finally {
      memory.close();
    }
  }));

test("remember action 'replace' overwrites a matched note by substring", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      await rememberTool.execute({ action: "add", note: "build command is npm build" }, ctx);
      const result = await rememberTool.execute(
        { action: "replace", old_text: "npm build", content: "build command is npm run build" },
        ctx
      );
      assert.equal(result, "Replaced.");
      const rendered = renderProjectNotes(ctx.projectPaths.notesFile);
      assert.match(rendered, /build command is npm run build/);
      assert.ok(!rendered.includes("build command is npm build\n") && !rendered.endsWith("npm build"));
    } finally {
      memory.close();
    }
  }));

test("remember action 'remove' deletes a matched note by substring", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      await rememberTool.execute({ action: "add", note: "stale fact" }, ctx);
      const result = await rememberTool.execute({ action: "remove", old_text: "stale fact" }, ctx);
      assert.equal(result, "Removed.");
      assert.equal(renderProjectNotes(ctx.projectPaths.notesFile), "");
    } finally {
      memory.close();
    }
  }));

test("remember rejects an unknown action", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    const ctx = buildContext(projectRoot, memory, sessionId);
    try {
      const result = await rememberTool.execute({ action: "delete_everything" }, ctx);
      assert.match(result, /unknown action/i);
    } finally {
      memory.close();
    }
  }));
