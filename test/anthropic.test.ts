import { test } from "node:test";
import assert from "node:assert/strict";
import { setConfigValue } from "../src/lib/config.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";

function sseStream(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("AnthropicProvider.streamChat accumulates text and tool_use blocks", async (t) => {
  setConfigValue("anthropicApiKey", "test-key");

  const events = [
    { type: "message_start", message: { usage: { input_tokens: 12, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Sure, " } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "let me check." } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "read_file" } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"path":' } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"a.txt"}' } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 24 } },
    { type: "message_stop" },
  ];

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () => sseStream(events)) as typeof fetch;

  const provider = new AnthropicProvider();
  let streamed = "";
  const result = await provider.streamChat({
    model: "claude-sonnet-5",
    messages: [
      { role: "system", content: "You are DevBuddy." },
      { role: "user", content: "Read a.txt" },
    ],
    onToken: (t) => (streamed += t),
  });

  assert.equal(streamed, "Sure, let me check.");
  assert.equal(result.content, "Sure, let me check.");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].id, "toolu_1");
  assert.equal(result.toolCalls[0].function.name, "read_file");
  assert.deepEqual(result.toolCalls[0].function.arguments, { path: "a.txt" });
  assert.equal(result.usage?.promptTokens, 12);
  assert.equal(result.usage?.completionTokens, 24);
});

test("AnthropicProvider.streamChat retries a transient 503 then succeeds", async (t) => {
  setConfigValue("anthropicApiKey", "test-key");

  const events = [
    { type: "content_block_start", index: 0, content_block: { type: "text" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_stop" },
  ];

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Response("overloaded", { status: 503 });
    return sseStream(events);
  }) as typeof fetch;

  const provider = new AnthropicProvider();
  const retries: number[] = [];
  const result = await provider.streamChat({
    model: "claude-sonnet-5",
    messages: [{ role: "user", content: "hi" }],
    onRetry: (info) => retries.push(info.attempt),
  });

  assert.equal(calls, 2);
  assert.deepEqual(retries, [1]);
  assert.equal(result.content, "ok");
});

test("AnthropicProvider.streamChat throws without an API key, immediately (not retried)", async () => {
  setConfigValue("anthropicApiKey", "");
  const provider = new AnthropicProvider();
  const start = Date.now();
  await assert.rejects(
    () => provider.streamChat({ model: "claude-sonnet-5", messages: [{ role: "user", content: "hi" }] }),
    /No API key set for the anthropic provider/
  );
  // A missing API key is a permanent config error, not a transient failure -
  // it must fail fast, not eat 3 retry attempts' worth of backoff delay first.
  assert.ok(Date.now() - start < 200, "missing API key should not trigger the retry backoff loop");
});
