import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectMemory } from "../src/lib/memory.js";

function withTempProject<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-memory-compaction-"));
  try {
    return fn(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("addMessage returns the inserted row's id", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    const id1 = memory.addMessage(sessionId, { role: "user", content: "hi" });
    const id2 = memory.addMessage(sessionId, { role: "assistant", content: "hello" });
    assert.equal(typeof id1, "number");
    assert.ok(id2 > id1);
    memory.close();
  }));

test("getSessionMessages returns full history when no compaction point is set", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    memory.addMessage(sessionId, { role: "system", content: "sys" });
    memory.addMessage(sessionId, { role: "user", content: "one" });
    memory.addMessage(sessionId, { role: "assistant", content: "two" });

    const all = memory.getSessionMessages(sessionId);
    assert.deepEqual(
      all.map((m) => m.content),
      ["sys", "one", "two"]
    );
    memory.close();
  }));

test("setCompactionPoint prepends the summary (wherever it was inserted) ahead of the kept-verbatim messages, in the right order", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    memory.addMessage(sessionId, { role: "system", content: "sys" });
    memory.addMessage(sessionId, { role: "user", content: "old message 1" });
    memory.addMessage(sessionId, { role: "assistant", content: "old message 2" });
    // "keep verbatim" messages already exist in the DB BEFORE the summary is
    // inserted (they were part of the live conversation before compaction ran) -
    // this is the exact scenario that broke a naive "id >= cutoff" approach.
    const keepFromId = memory.addMessage(sessionId, { role: "user", content: "recent message 1" });
    memory.addMessage(sessionId, { role: "assistant", content: "recent message 2" });
    const summaryId = memory.addMessage(sessionId, { role: "assistant", content: "[Earlier conversation summary]\n..." });

    memory.setCompactionPoint(sessionId, summaryId, keepFromId);

    const afterCompaction = memory.getSessionMessages(sessionId);
    assert.deepEqual(
      afterCompaction.map((m) => m.content),
      ["[Earlier conversation summary]\n...", "recent message 1", "recent message 2"]
    );
    memory.close();
  }));

test("messages added after compaction appear after the kept-verbatim window", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    memory.addMessage(sessionId, { role: "system", content: "sys" });
    const keepFromId = memory.addMessage(sessionId, { role: "user", content: "recent" });
    const summaryId = memory.addMessage(sessionId, { role: "assistant", content: "[Earlier conversation summary]\n..." });
    memory.setCompactionPoint(sessionId, summaryId, keepFromId);

    memory.addMessage(sessionId, { role: "assistant", content: "brand new turn" });

    const messages = memory.getSessionMessages(sessionId);
    assert.deepEqual(
      messages.map((m) => m.content),
      ["[Earlier conversation summary]\n...", "recent", "brand new turn"]
    );
    memory.close();
  }));

test("devbuddy history's full transcript is unaffected by a compaction point (getTranscript reads everything)", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    memory.addMessage(sessionId, { role: "system", content: "sys" });
    const keepFromId = memory.addMessage(sessionId, { role: "user", content: "old message" });
    const summaryId = memory.addMessage(sessionId, { role: "assistant", content: "[Earlier conversation summary]\n..." });
    memory.setCompactionPoint(sessionId, summaryId, keepFromId);
    memory.close();

    const memory2 = new ProjectMemory(projectRoot);
    const transcript = memory2.getTranscript(sessionId);
    assert.deepEqual(
      transcript.map((m) => m.content),
      ["sys", "old message", "[Earlier conversation summary]\n..."]
    );
    memory2.close();
  }));

test("a second compaction moves the cutoff and summary forward, further trimming getSessionMessages", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    memory.addMessage(sessionId, { role: "system", content: "sys" });
    const keepFrom1 = memory.addMessage(sessionId, { role: "user", content: "batch 1" });
    const summary1 = memory.addMessage(sessionId, { role: "assistant", content: "[Earlier conversation summary]\nsummary 1" });
    memory.setCompactionPoint(sessionId, summary1, keepFrom1);

    const keepFrom2 = memory.addMessage(sessionId, { role: "user", content: "batch 2" });
    const summary2 = memory.addMessage(sessionId, { role: "assistant", content: "[Earlier conversation summary]\nsummary 2" });
    memory.setCompactionPoint(sessionId, summary2, keepFrom2);

    memory.addMessage(sessionId, { role: "user", content: "latest" });

    const messages = memory.getSessionMessages(sessionId);
    assert.deepEqual(
      messages.map((m) => m.content),
      ["[Earlier conversation summary]\nsummary 2", "batch 2", "latest"]
    );
    memory.close();
  }));

test("getSessionMessagesWithIds tags each message with its real row id", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    const id1 = memory.addMessage(sessionId, { role: "user", content: "a" });
    const id2 = memory.addMessage(sessionId, { role: "assistant", content: "b" });

    const withIds = memory.getSessionMessagesWithIds(sessionId);
    assert.deepEqual(
      withIds.map((m) => m.id),
      [id1, id2]
    );
    memory.close();
  }));
