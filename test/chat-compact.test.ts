import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactSession } from "../src/commands/chat.js";
import { ProjectMemory } from "../src/lib/memory.js";
import type { ChatProvider, StreamChatOptions, StreamChatResult } from "../src/providers/types.js";

class FakeProvider implements ChatProvider {
  readonly name = "fake";
  constructor(private response: string) {}
  async checkConnection(): Promise<boolean> {
    return true;
  }
  async listModels(): Promise<string[]> {
    return [];
  }
  async streamChat(_opts: StreamChatOptions): Promise<StreamChatResult> {
    return { content: this.response, toolCalls: [] };
  }
}

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-chat-compact-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

/** Mimics what chat.ts's REPL loop actually does: every user/assistant
 *  message is persisted via memory.addMessage as the conversation happens,
 *  before compactSession is ever called. */
function seedConversation(memory: ProjectMemory, sessionId: number, turns: number): void {
  memory.addMessage(sessionId, { role: "system", content: "system prompt" });
  for (let i = 0; i < turns; i++) {
    memory.addMessage(sessionId, { role: "user", content: `question ${i} `.repeat(20) });
    memory.addMessage(sessionId, { role: "assistant", content: `answer ${i} `.repeat(20) });
  }
}

test("compactSession (the function chat.ts actually calls) persists the summary and compaction point", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("fake", "test-model");
    seedConversation(memory, sessionId, 10); // 1 system + 20 non-system, already in the DB

    const provider = new FakeProvider("Summarized: built X, ran tests, all green.");
    const result = await compactSession(provider, "test-model", memory, sessionId);

    assert.ok(result);
    assert.equal(result!.compactedCount, 12); // 20 non-system - 8 kept

    // The persisted, DB-backed view (what a resumed session would reload) must
    // match what compactSession handed the live REPL loop, minus the system
    // message - resuming always rebuilds a fresh one (current tools/skills),
    // so it's never part of what's persisted or reloaded from the DB.
    const persisted = memory.getSessionMessages(sessionId);
    assert.deepEqual(
      persisted.map((m) => m.content),
      result!.messages.filter((m) => m.role !== "system").map((m) => m.content)
    );
    assert.match(persisted[0].content, /^\[Earlier conversation summary\]/);
    assert.match(persisted[0].content, /Summarized: built X, ran tests, all green\./);
    assert.equal(persisted.length, 9); // summary + 8 kept

    memory.close();
  }));

test("compactSession returns null and writes nothing new when there isn't enough to compact", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("fake", "test-model");
    memory.addMessage(sessionId, { role: "system", content: "sys" });
    memory.addMessage(sessionId, { role: "user", content: "hi" });
    memory.addMessage(sessionId, { role: "assistant", content: "hello" });

    const provider = new FakeProvider("should not be called for this");
    const result = await compactSession(provider, "test-model", memory, sessionId);

    assert.equal(result, null);
    assert.equal(memory.getSessionMessages(sessionId).length, 3); // unchanged - nothing added

    memory.close();
  }));

test("a second compactSession call on an already-compacted session moves the compaction point forward again", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("fake", "test-model");
    seedConversation(memory, sessionId, 10);

    const first = await compactSession(new FakeProvider("first summary"), "test-model", memory, sessionId);
    assert.ok(first);

    // More conversation happens after the first compaction, exactly like a live REPL loop would persist it.
    for (let i = 0; i < 10; i++) {
      memory.addMessage(sessionId, { role: "user", content: `more ${i} `.repeat(20) });
      memory.addMessage(sessionId, { role: "assistant", content: `more answer ${i} `.repeat(20) });
    }

    const second = await compactSession(new FakeProvider("second summary"), "test-model", memory, sessionId);
    assert.ok(second);

    const persisted = memory.getSessionMessages(sessionId);
    assert.match(persisted[0].content, /second summary/);
    // the first summary is no longer part of the live/resumable view...
    assert.ok(!persisted.some((m) => m.content.includes("first summary")));
    // ...but it's still there in the full audit log.
    const fullTranscript = memory.getTranscript(sessionId);
    assert.ok(fullTranscript.some((m) => m.content.includes("first summary")));

    memory.close();
  }));
