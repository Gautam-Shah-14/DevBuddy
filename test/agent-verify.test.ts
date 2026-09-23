import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentTurn, type VerifyEvent } from "../src/lib/agent.js";
import { ProjectMemory } from "../src/lib/memory.js";
import { ensureProject } from "../src/lib/project.js";
import { setConfigValue } from "../src/lib/config.js";
import type { ChatProvider, ChatMessage, StreamChatOptions, StreamChatResult } from "../src/providers/types.js";
import type { ToolDefinition } from "../src/tools/types.js";

/** A fake tool named like the real write_file so MUTATING_TOOLS treats it as
 *  a file mutation, without touching the real permission/sandbox machinery. */
const fakeWriteTool: ToolDefinition = {
  name: "write_file",
  description: "fake write_file for tests",
  parameters: { type: "object" },
  async execute() {
    return "Wrote 3 bytes to fake.txt";
  },
};

/** Replays a fixed script of streamChat results, one per call (repeats the last entry past the end). */
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
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-agent-verify-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

const toolCall = { function: { name: "write_file", arguments: {} } };
const FAILING_CMD = 'node -e "console.log(\'boom\');process.exit(1)"';

test("self-verification retries once on failure, then returns the model's next answer", () =>
  withTempProject(async (projectRoot) => {
    setConfigValue("verifyCommand", FAILING_CMD);
    const paths = ensureProject(projectRoot);
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("scripted", "test-model");

    const provider = new ScriptedProvider([
      { content: "", toolCalls: [toolCall] }, // 1: mutates a file
      { content: "final answer", toolCalls: [] }, // 2: triggers verify -> fails -> retry
      { content: "final answer again", toolCalls: [] }, // 3: no new mutation -> no re-verify
    ]);

    const verifyEvents: VerifyEvent[] = [];
    const result = await runAgentTurn({
      model: "test-model",
      provider,
      messages: [{ role: "user", content: "do something" }],
      tools: [fakeWriteTool],
      skills: [],
      projectRoot,
      projectPaths: paths,
      memory,
      sessionId,
      onToken: () => {},
      onVerify: (e) => verifyEvents.push(e),
    });

    memory.close();

    assert.equal(result.content, "final answer again");
    assert.equal(provider.calls, 3);
    assert.deepEqual(
      verifyEvents.map((e) => e.status),
      ["running", "failed"]
    );
    assert.match(verifyEvents[1].output ?? "", /boom/);
  }));

test("self-verification stops retrying once the attempt cap is hit, even if still failing", () =>
  withTempProject(async (projectRoot) => {
    setConfigValue("verifyCommand", FAILING_CMD);
    const paths = ensureProject(projectRoot);
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("scripted", "test-model");

    const provider = new ScriptedProvider([
      { content: "", toolCalls: [toolCall] }, // 1: mutate
      { content: "answer1", toolCalls: [] }, // 2: verify attempt 1 -> fails -> retry
      { content: "", toolCalls: [toolCall] }, // 3: mutate again
      { content: "answer2", toolCalls: [] }, // 4: verify attempt 2 (cap) -> fails -> retry
      { content: "", toolCalls: [toolCall] }, // 5: mutate again
      { content: "answer3", toolCalls: [] }, // 6: cap reached -> returned without a 3rd verify
    ]);

    const verifyEvents: VerifyEvent[] = [];
    const result = await runAgentTurn({
      model: "test-model",
      provider,
      messages: [{ role: "user", content: "do something" }],
      tools: [fakeWriteTool],
      skills: [],
      projectRoot,
      projectPaths: paths,
      memory,
      sessionId,
      onToken: () => {},
      onVerify: (e) => verifyEvents.push(e),
    });

    memory.close();

    assert.equal(result.content, "answer3");
    const failedCount = verifyEvents.filter((e) => e.status === "failed").length;
    assert.equal(failedCount, 2); // capped at MAX_VERIFY_ATTEMPTS
  }));

test("self-verification does not run when nothing was mutated", () =>
  withTempProject(async (projectRoot) => {
    setConfigValue("verifyCommand", FAILING_CMD);
    const paths = ensureProject(projectRoot);
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("scripted", "test-model");

    const provider = new ScriptedProvider([{ content: "just an answer, no tools used", toolCalls: [] }]);
    const verifyEvents: VerifyEvent[] = [];
    const result = await runAgentTurn({
      model: "test-model",
      provider,
      messages: [{ role: "user", content: "just answer" }],
      tools: [fakeWriteTool],
      skills: [],
      projectRoot,
      projectPaths: paths,
      memory,
      sessionId,
      onToken: () => {},
      onVerify: (e) => verifyEvents.push(e),
    });

    memory.close();

    assert.equal(result.content, "just an answer, no tools used");
    assert.equal(verifyEvents.length, 0);
  }));
