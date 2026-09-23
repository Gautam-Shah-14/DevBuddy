import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, resolveCompactThreshold, shouldCompact, compactMessages, type IdentifiedMessage } from "../src/lib/compact.js";
import type { ChatMessage, ChatProvider, StreamChatOptions, StreamChatResult } from "../src/providers/types.js";

function msgs(count: number, contentLength = 20): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: "system prompt" }];
  for (let i = 0; i < count; i++) {
    out.push({ role: i % 2 === 0 ? "user" : "assistant", content: "x".repeat(contentLength) + `#${i}` });
  }
  return out;
}

function identified(messages: ChatMessage[], startId = 1): IdentifiedMessage[] {
  return messages.map((m, i) => ({ ...m, id: startId + i }));
}

class FakeProvider implements ChatProvider {
  readonly name = "fake";
  lastRequest: StreamChatOptions | null = null;
  constructor(private response: string) {}
  async checkConnection(): Promise<boolean> {
    return true;
  }
  async listModels(): Promise<string[]> {
    return [];
  }
  async streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
    this.lastRequest = opts;
    return { content: this.response, toolCalls: [] };
  }
}

test("estimateTokens is roughly chars/4", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("a".repeat(400)), 100);
});

test("resolveCompactThreshold: 'off' disables, a numeric string parses, garbage is null", () => {
  assert.equal(resolveCompactThreshold("off"), null);
  assert.equal(resolveCompactThreshold("6000"), 6000);
  assert.equal(resolveCompactThreshold("not-a-number"), null);
  assert.equal(resolveCompactThreshold("-5"), null);
});

test("shouldCompact is false when disabled, even with a huge conversation", () => {
  assert.equal(shouldCompact(msgs(50, 1000), null, 8), false);
});

test("shouldCompact is false when under the token threshold", () => {
  assert.equal(shouldCompact(msgs(4, 10), 100000, 8), false);
});

test("shouldCompact is false when there aren't more messages than keepRecent, even over threshold", () => {
  // 6 non-system messages, keepRecent=8 - nothing would be left to summarize
  assert.equal(shouldCompact(msgs(6, 10000), 10, 8), false);
});

test("shouldCompact is true once both the size and threshold conditions are met", () => {
  assert.equal(shouldCompact(msgs(20, 200), 100, 8), true);
});

test("compactMessages returns null when there isn't enough to compact", async () => {
  const provider = new FakeProvider("summary");
  const result = await compactMessages(provider, "test-model", identified(msgs(4)), 8);
  assert.equal(result, null);
});

test("compactMessages keeps the most recent messages verbatim and summarizes the rest", async () => {
  const provider = new FakeProvider("Did X, then Y. TODO: Z.");
  const messages = identified(msgs(20)); // 1 system + 20 non-system, ids 1..21

  const result = await compactMessages(provider, "test-model", messages, 8);
  assert.ok(result);
  assert.equal(result!.compactedCount, 12); // 20 - 8 kept
  assert.equal(result!.keepFromMessageId, messages[messages.length - 8].id);

  // system message preserved first, then the summary, then the last 8 verbatim
  assert.equal(result!.messages[0].role, "system");
  assert.equal(result!.messages[1], result!.summaryMessage);
  assert.match(result!.summaryMessage.content, /^\[Earlier conversation summary\]/);
  assert.match(result!.summaryMessage.content, /Did X, then Y\. TODO: Z\./);

  const keptVerbatim = result!.messages.slice(2);
  assert.equal(keptVerbatim.length, 8);
  assert.deepEqual(
    keptVerbatim.map((m) => m.content),
    messages.slice(-8).map((m) => m.content)
  );

  // the summarization request itself only included the OLDER messages, not the kept-recent ones
  const sentToProvider = provider.lastRequest!.messages;
  const sentContents = sentToProvider.map((m) => m.content);
  assert.ok(!sentContents.some((c) => c === messages[messages.length - 1].content));
  assert.equal(sentToProvider[sentToProvider.length - 1].role, "user"); // the summarize instruction
});

test("compactMessages handles a conversation with no system message", async () => {
  const provider = new FakeProvider("summary text");
  const messages = identified(msgs(15).filter((m) => m.role !== "system"));
  const result = await compactMessages(provider, "test-model", messages, 8);
  assert.ok(result);
  assert.equal(result!.messages[0], result!.summaryMessage);
});

test("compactMessages' keepFromMessageId reflects real (non-contiguous) ids, not array position", async () => {
  const provider = new FakeProvider("summary");
  // simulate a session that already had an earlier compaction: ids jump around
  const messages: IdentifiedMessage[] = [
    { id: 1, role: "system", content: "sys" },
    { id: 50, role: "assistant", content: "[Earlier conversation summary]\nold stuff" },
    { id: 51, role: "user", content: "a" },
    { id: 52, role: "assistant", content: "b" },
    { id: 53, role: "user", content: "c" },
  ];
  const result = await compactMessages(provider, "test-model", messages, 2);
  assert.ok(result);
  assert.equal(result!.keepFromMessageId, 52); // last 2 non-system: ids 52, 53
});
