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

const fakeShellTool: ToolDefinition = {
  name: "run_shell",
  description: "fake run_shell for tests",
  parameters: { type: "object" },
  async execute() {
    return "(no output)";
  },
};

/** Streams `content` to onToken in the given chunks (or as one chunk if omitted), then returns it as the final result. */
class ScriptedProvider implements ChatProvider {
  readonly name = "scripted";
  calls = 0;
  constructor(private script: { content: string; chunks?: string[] }[]) {}
  async checkConnection(): Promise<boolean> {
    return true;
  }
  async listModels(): Promise<string[]> {
    return [];
  }
  async streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
    const turn = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls++;
    const chunks = turn.chunks ?? [turn.content];
    for (const chunk of chunks) opts.onToken?.(chunk);
    return { content: turn.content, toolCalls: [] };
  }
}

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-agent-react-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

async function runWithScript(
  projectRoot: string,
  script: { content: string; chunks?: string[] }[]
): Promise<{ streamedTokens: string[]; toolStarted: boolean }> {
  const paths = ensureProject(projectRoot);
  const memory = new ProjectMemory(projectRoot);
  const sessionId = memory.startSession("scripted", "test-model");
  const provider = new ScriptedProvider(script);
  const streamedTokens: string[] = [];
  let toolStarted = false;

  await runAgentTurn({
    model: "test-model",
    provider,
    messages: [{ role: "user", content: "create a file" }],
    tools: [fakeShellTool],
    skills: [],
    projectRoot,
    projectPaths: paths,
    memory,
    sessionId,
    onToken: (t) => streamedTokens.push(t),
    onToolStart: () => {
      toolStarted = true;
    },
  });

  memory.close();
  return { streamedTokens, toolStarted };
}

test("a ReAct tool_call fence sent as one chunk is never streamed to onToken, but the tool still runs", () =>
  withTempProject(async (projectRoot) => {
    const fence = '```tool_call\n{"name": "run_shell", "arguments": {"command": "touch x.txt"}}\n```';
    const { streamedTokens, toolStarted } = await runWithScript(projectRoot, [
      { content: fence },
      { content: "done" },
    ]);

    assert.ok(toolStarted, "the tool call should still have executed");
    const shown = streamedTokens.join("");
    assert.ok(!shown.includes("tool_call"), `raw fence leaked to the terminal: ${JSON.stringify(shown)}`);
  }));

test("a ReAct tool_call fence streamed character by character is still fully suppressed", () =>
  withTempProject(async (projectRoot) => {
    const fence = '```tool_call\n{"name": "run_shell", "arguments": {}}\n```';
    const { streamedTokens, toolStarted } = await runWithScript(projectRoot, [
      { content: fence, chunks: [...fence] }, // one character per onToken call, like real token streaming
      { content: "done" },
    ]);

    assert.ok(toolStarted);
    const shown = streamedTokens.join("");
    assert.ok(!shown.includes("tool_call"), `raw fence leaked to the terminal: ${JSON.stringify(shown)}`);
  }));

test("ordinary prose streams through unaffected, including a message that opens with an unrelated code fence", () =>
  withTempProject(async (projectRoot) => {
    const content = "```python\nprint('hi')\n```\nHope that helps!";
    const { streamedTokens, toolStarted } = await runWithScript(projectRoot, [
      { content, chunks: [...content] },
    ]);

    assert.equal(toolStarted, false);
    assert.equal(streamedTokens.join(""), content);
  }));

test("a short reply shorter than the fence prefix is still flushed once streaming ends", () =>
  withTempProject(async (projectRoot) => {
    const content = "ok";
    const { streamedTokens } = await runWithScript(projectRoot, [{ content }]);
    assert.equal(streamedTokens.join(""), content);
  }));
