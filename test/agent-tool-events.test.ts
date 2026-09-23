import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentTurn } from "../src/lib/agent.js";
import { ProjectMemory } from "../src/lib/memory.js";
import { ensureProject } from "../src/lib/project.js";
import type { ChatProvider, StreamChatOptions, StreamChatResult } from "../src/providers/types.js";
import type { ToolDefinition } from "../src/tools/types.js";

const fakeReadTool: ToolDefinition = {
  name: "read_file",
  description: "fake read_file for tests",
  parameters: { type: "object" },
  async execute(args) {
    if (args.path === "missing.txt") return "Error: file not found: missing.txt";
    return "file contents";
  },
};

const fakeUseSkillTool: ToolDefinition = {
  name: "use_skill",
  description: "fake use_skill for tests",
  parameters: { type: "object" },
  async execute(args) {
    return `# Skill: ${args.name}\n\ninstructions`;
  },
};

const fakeMcpTool: ToolDefinition = {
  name: "mcp__filesystem__list",
  description: "fake MCP connector tool for tests",
  parameters: { type: "object" },
  async execute() {
    return "[]";
  },
};

class ScriptedProvider implements ChatProvider {
  readonly name = "scripted";
  calls = 0;
  constructor(private script: StreamChatResult[]) {}
  async checkConnection(): Promise<boolean> {
    return true;
  }
  async listModels(): Promise<string[]> {
    return [];
  }
  async streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
    const result = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls++;
    if (result.content) opts.onToken?.(result.content);
    return result;
  }
}

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-agent-tool-events-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

test("runAgentTurn records a tool_events row for every tool call, success and failure alike", () =>
  withTempProject(async (projectRoot) => {
    const paths = ensureProject(projectRoot);
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("scripted", "test-model");

    const provider = new ScriptedProvider([
      {
        content: "",
        toolCalls: [
          { function: { name: "read_file", arguments: { path: "ok.txt" } } },
          { function: { name: "read_file", arguments: { path: "missing.txt" } } },
          { function: { name: "use_skill", arguments: { name: "deploy-checklist" } } },
          { function: { name: "mcp__filesystem__list", arguments: {} } },
        ],
      },
      { content: "done", toolCalls: [] },
    ]);

    await runAgentTurn({
      model: "test-model",
      provider,
      messages: [{ role: "user", content: "read some files" }],
      tools: [fakeReadTool, fakeUseSkillTool, fakeMcpTool],
      skills: [],
      projectRoot,
      projectPaths: paths,
      memory,
      sessionId,
      onToken: () => {},
    });

    const stats = memory.getToolStats(sessionId);
    assert.equal(stats.total, 4);
    assert.equal(stats.passed, 3);
    assert.equal(stats.failed, 1);

    const readFile = stats.byTool.find((t) => t.toolName === "read_file");
    assert.equal(readFile?.total, 2);
    assert.equal(readFile?.passed, 1);
    assert.equal(readFile?.failed, 1);

    const skills = memory.getSkillUsage(sessionId);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, "deploy-checklist");

    const connectors = memory.getConnectorUsage(sessionId);
    assert.equal(connectors.length, 1);
    assert.equal(connectors[0].name, "filesystem");

    memory.close();
  }));

test("runAgentTurn records an event for an unknown tool call as a failure", () =>
  withTempProject(async (projectRoot) => {
    const paths = ensureProject(projectRoot);
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("scripted", "test-model");

    const provider = new ScriptedProvider([
      { content: "", toolCalls: [{ function: { name: "no_such_tool", arguments: {} } }] },
      { content: "done", toolCalls: [] },
    ]);

    await runAgentTurn({
      model: "test-model",
      provider,
      messages: [{ role: "user", content: "do the thing" }],
      tools: [],
      skills: [],
      projectRoot,
      projectPaths: paths,
      memory,
      sessionId,
      onToken: () => {},
    });

    const stats = memory.getToolStats(sessionId);
    assert.equal(stats.total, 1);
    assert.equal(stats.failed, 1);
    assert.equal(stats.byTool[0].toolName, "no_such_tool");

    memory.close();
  }));
