import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentTurn } from "../src/lib/agent.js";
import { ProjectMemory } from "../src/lib/memory.js";
import { ensureProject } from "../src/lib/project.js";
import type { ChatProvider, StreamChatOptions, StreamChatResult, ToolCall } from "../src/providers/types.js";
import type { ToolDefinition } from "../src/tools/types.js";

const fakeReadTool: ToolDefinition = {
  name: "read_file",
  description: "fake read_file for tests",
  parameters: { type: "object" },
  async execute() {
    return "file contents";
  },
};

function toolCallResult(calls: { name: string; arguments?: Record<string, unknown> }[]): StreamChatResult {
  const toolCalls: ToolCall[] = calls.map((c) => ({ function: { name: c.name, arguments: c.arguments ?? {} } }));
  return { content: "", toolCalls };
}

function reactFenceResult(raw: string): StreamChatResult {
  return { content: `\`\`\`tool_call\n${raw}\n\`\`\``, toolCalls: [] };
}

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
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-agent-tool-repair-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

async function runWithScript(projectRoot: string, script: StreamChatResult[]) {
  const paths = ensureProject(projectRoot);
  const memory = new ProjectMemory(projectRoot);
  const sessionId = memory.startSession("scripted", "test-model");
  const provider = new ScriptedProvider(script);
  const toolStarts: string[] = [];

  const result = await runAgentTurn({
    model: "test-model",
    provider,
    messages: [{ role: "user", content: "do something" }],
    tools: [fakeReadTool],
    skills: [],
    projectRoot,
    projectPaths: paths,
    memory,
    sessionId,
    onToken: () => {},
    onToolStart: (name) => toolStarts.push(name),
  });

  memory.close();
  return { result, toolStarts };
}

test("a hallucinated tool name with wrong case/separators is auto-repaired and the real tool runs", () =>
  withTempProject(async (projectRoot) => {
    const { result, toolStarts } = await runWithScript(projectRoot, [
      toolCallResult([{ name: "Read-File", arguments: { path: "x.txt" } }]),
      { content: "done", toolCalls: [] },
    ]);
    assert.deepEqual(toolStarts, ["read_file"]);
    assert.equal(result.content, "done");
  }));

test("a tool name with a stray 'Tool' suffix is auto-repaired", () =>
  withTempProject(async (projectRoot) => {
    const { toolStarts } = await runWithScript(projectRoot, [
      toolCallResult([{ name: "read_file_tool" }]),
      { content: "done", toolCalls: [] },
    ]);
    assert.deepEqual(toolStarts, ["read_file"]);
  }));

test("a completely unrelated tool name is NOT repaired - stays an error, not routed to the wrong tool", () =>
  withTempProject(async (projectRoot) => {
    const { toolStarts, result } = await runWithScript(projectRoot, [
      toolCallResult([{ name: "delete_everything" }]),
      toolCallResult([{ name: "delete_everything" }]),
      toolCallResult([{ name: "delete_everything" }]),
    ]);
    // Never silently resolved to read_file (the only real tool) - onToolStart
    // always sees the original hallucinated name, meaning no repair happened.
    assert.ok(toolStarts.every((n) => n === "delete_everything"));
    assert.match(result.content, /unknown tools 3 times/);
  }));

test("a turn that keeps calling unknown tools gives up after MAX_INVALID_TOOL_NAME_STRIKES instead of burning all iterations", () =>
  withTempProject(async (projectRoot) => {
    const provider = new ScriptedProvider([toolCallResult([{ name: "does_not_exist" }])]);
    const paths = ensureProject(projectRoot);
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("scripted", "test-model");

    const result = await runAgentTurn({
      model: "test-model",
      provider,
      messages: [{ role: "user", content: "x" }],
      tools: [fakeReadTool],
      skills: [],
      projectRoot,
      projectPaths: paths,
      memory,
      sessionId,
      onToken: () => {},
    });

    // Stopped well short of the 15-iteration cap.
    assert.ok(provider.calls <= 3, `expected to give up quickly, but the model was called ${provider.calls} times`);
    assert.match(result.content, /unknown tools 3 times/);
    memory.close();
  }));

test("one hallucinated call alongside a valid one in the same batch doesn't count as a strike", () =>
  withTempProject(async (projectRoot) => {
    const { toolStarts, result } = await runWithScript(projectRoot, [
      toolCallResult([{ name: "read_file", arguments: { path: "x.txt" } }, { name: "totally_unknown" }]),
      { content: "done", toolCalls: [] },
    ]);
    assert.deepEqual(toolStarts, ["read_file", "totally_unknown"]);
    assert.equal(result.content, "done");
  }));

test("a malformed ReAct tool_call fence gets a 'fix your JSON' retry instead of being shown as the final answer", () =>
  withTempProject(async (projectRoot) => {
    const { result, toolStarts } = await runWithScript(projectRoot, [
      reactFenceResult("{not valid json"),
      toolCallResult([{ name: "read_file", arguments: { path: "x.txt" } }]),
      { content: "done", toolCalls: [] },
    ]);
    assert.deepEqual(toolStarts, ["read_file"]);
    assert.equal(result.content, "done");
  }));

test("a persistently malformed ReAct fence gives up after MAX_REACT_JSON_RETRIES instead of looping forever", () =>
  withTempProject(async (projectRoot) => {
    const provider = new ScriptedProvider([reactFenceResult("{not valid json")]);
    const paths = ensureProject(projectRoot);
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("scripted", "test-model");

    const result = await runAgentTurn({
      model: "test-model",
      provider,
      messages: [{ role: "user", content: "x" }],
      tools: [fakeReadTool],
      skills: [],
      projectRoot,
      projectPaths: paths,
      memory,
      sessionId,
      onToken: () => {},
    });

    assert.ok(provider.calls <= 4, `expected to give up quickly, but the model was called ${provider.calls} times`);
    assert.match(result.content, /malformed tool_call JSON/);
    memory.close();
  }));

test("a valid ReAct tool_call fence still works exactly as before", () =>
  withTempProject(async (projectRoot) => {
    const { toolStarts, result } = await runWithScript(projectRoot, [
      reactFenceResult(JSON.stringify({ name: "read_file", arguments: { path: "x.txt" } })),
      { content: "done", toolCalls: [] },
    ]);
    assert.deepEqual(toolStarts, ["read_file"]);
    assert.equal(result.content, "done");
  }));
