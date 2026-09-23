import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectMemory } from "../src/lib/memory.js";
import { projectPaths } from "../src/lib/project.js";

function withTempProject<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-memory-tool-events-"));
  try {
    return fn(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("addToolEvent classifies a builtin tool call and getToolStats counts pass/fail", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");

    memory.addToolEvent(sessionId, "write_file", '{"path":"a.txt"}', true, "Wrote 5 bytes to a.txt");
    memory.addToolEvent(sessionId, "write_file", '{"path":"b.txt"}', true, "Wrote 3 bytes to b.txt");
    memory.addToolEvent(sessionId, "read_file", '{"path":"missing.txt"}', false, "Error: file not found: missing.txt");

    const stats = memory.getToolStats(sessionId);
    assert.equal(stats.total, 3);
    assert.equal(stats.passed, 2);
    assert.equal(stats.failed, 1);

    const writeFile = stats.byTool.find((t) => t.toolName === "write_file");
    const readFile = stats.byTool.find((t) => t.toolName === "read_file");
    assert.deepEqual(writeFile, { toolName: "write_file", total: 2, passed: 2, failed: 0 });
    assert.deepEqual(readFile, { toolName: "read_file", total: 1, passed: 0, failed: 1 });

    memory.close();
  }));

test("addToolEvent classifies use_skill as a skill event and getSkillUsage reports it", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");

    memory.addToolEvent(sessionId, "use_skill", '{"name":"deploy-checklist"}', true, "# Skill: deploy-checklist\n...");
    memory.addToolEvent(sessionId, "use_skill", '{"name":"deploy-checklist"}', true, "# Skill: deploy-checklist\n...");
    memory.addToolEvent(sessionId, "use_skill", '{"name":"other-skill"}', true, "# Skill: other-skill\n...");

    const usage = memory.getSkillUsage(sessionId);
    const deploy = usage.find((u) => u.name === "deploy-checklist");
    assert.equal(deploy?.count, 2);
    assert.equal(usage.find((u) => u.name === "other-skill")?.count, 1);

    // a builtin tool call must never show up as skill usage
    memory.addToolEvent(sessionId, "read_file", "{}", true, "content");
    assert.equal(memory.getSkillUsage(sessionId).some((u) => u.name === "read_file"), false);

    memory.close();
  }));

test("addToolEvent classifies mcp__<connector>__<tool> as a connector event and getConnectorUsage reports it", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");

    memory.addToolEvent(sessionId, "mcp__filesystem__read", "{}", true, "ok");
    memory.addToolEvent(sessionId, "mcp__filesystem__write", "{}", false, "Error: denied");
    memory.addToolEvent(sessionId, "mcp__github__list_prs", "{}", true, "[]");

    const usage = memory.getConnectorUsage(sessionId);
    assert.equal(usage.find((u) => u.name === "filesystem")?.count, 2);
    assert.equal(usage.find((u) => u.name === "github")?.count, 1);

    const stats = memory.getToolStats(sessionId);
    assert.equal(stats.total, 3);
    assert.equal(stats.failed, 1);

    memory.close();
  }));

test("getToolStats/getSkillUsage/getConnectorUsage scope to a session when given one, and to the whole project otherwise", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const session1 = memory.startSession("ollama", "llama3.1");
    const session2 = memory.startSession("ollama", "llama3.1");

    memory.addToolEvent(session1, "read_file", "{}", true, "a");
    memory.addToolEvent(session1, "use_skill", '{"name":"s1"}', true, "a");
    memory.addToolEvent(session2, "read_file", "{}", true, "b");
    memory.addToolEvent(session2, "mcp__git__status", "{}", true, "b");

    assert.equal(memory.getToolStats(session1).total, 2);
    assert.equal(memory.getToolStats(session2).total, 2);
    assert.equal(memory.getToolStats().total, 4); // whole project

    assert.equal(memory.getSkillUsage(session1).length, 1);
    assert.equal(memory.getSkillUsage(session2).length, 0);
    assert.equal(memory.getConnectorUsage(session1).length, 0);
    assert.equal(memory.getConnectorUsage(session2).length, 1);

    memory.close();
  }));

test("a truncated result_preview does not affect success/failure counting", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    const hugeResult = "x".repeat(2000);

    memory.addToolEvent(sessionId, "run_shell", "{}", true, hugeResult);
    const stats = memory.getToolStats(sessionId);
    assert.equal(stats.passed, 1);
    assert.equal(stats.failed, 0);

    memory.close();
  }));

test("toolStatsFrom/skillUsageFrom/connectorUsageFrom (static, no-side-effect reads) match the instance methods", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    memory.addToolEvent(sessionId, "use_skill", '{"name":"s1"}', true, "ok");
    memory.addToolEvent(sessionId, "mcp__git__status", "{}", false, "Error: nope");
    memory.close();

    const dbFile = projectPaths(projectRoot).dbFile;
    const stats = ProjectMemory.toolStatsFrom(dbFile, sessionId);
    assert.equal(stats?.total, 2);
    assert.equal(stats?.passed, 1);
    assert.equal(stats?.failed, 1);
    assert.equal(stats?.byTool.find((t) => t.toolName === "use_skill")?.passed, 1);
    assert.equal(stats?.byTool.find((t) => t.toolName === "mcp__git__status")?.failed, 1);
    assert.equal(ProjectMemory.skillUsageFrom(dbFile, sessionId).length, 1);
    assert.equal(ProjectMemory.connectorUsageFrom(dbFile, sessionId).length, 1);
    assert.equal(ProjectMemory.toolStatsFrom(join(projectRoot, "nonexistent.db")), null);
  }));
