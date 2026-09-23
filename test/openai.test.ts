import { test } from "node:test";
import assert from "node:assert/strict";
import { setConfigValue } from "../src/lib/config.js";
import { OpenAiProvider } from "../src/providers/openai.js";

function sseStream(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("OpenAiProvider.streamChat throws without an API key, immediately (not retried)", async () => {
  setConfigValue("openaiApiKey", "");
  const provider = new OpenAiProvider();
  const start = Date.now();
  await assert.rejects(
    () => provider.streamChat({ model: "gpt-5", messages: [{ role: "user", content: "hi" }] }),
    /No API key set for the openai provider/
  );
  assert.ok(Date.now() - start < 200, "missing API key should not trigger the retry backoff loop");
});

test("OpenAiProvider.streamChat retries a transient 503 then succeeds", async (t) => {
  setConfigValue("openaiApiKey", "test-key");

  const chunks = [
    { choices: [{ delta: { content: "hi " } }] },
    { choices: [{ delta: { content: "there" } }] },
    { choices: [{ delta: {} }], usage: { prompt_tokens: 3, completion_tokens: 2 } },
  ];

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Response("overloaded", { status: 503 });
    return sseStream(chunks);
  }) as typeof fetch;

  const provider = new OpenAiProvider();
  const retries: number[] = [];
  let streamed = "";
  const result = await provider.streamChat({
    model: "gpt-5",
    messages: [{ role: "user", content: "hi" }],
    onToken: (t) => (streamed += t),
    onRetry: (info) => retries.push(info.attempt),
  });

  assert.equal(calls, 2);
  assert.deepEqual(retries, [1]);
  assert.equal(streamed, "hi there");
  assert.equal(result.content, "hi there");
  assert.equal(result.usage?.promptTokens, 3);
  assert.equal(result.usage?.completionTokens, 2);
});

test("OpenAiProvider.streamChat does not retry a 400 (bad request)", async (t) => {
  setConfigValue("openaiApiKey", "test-key");

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("bad request", { status: 400, statusText: "Bad Request" });
  }) as typeof fetch;

  const provider = new OpenAiProvider();
  await assert.rejects(
    () => provider.streamChat({ model: "gpt-5", messages: [{ role: "user", content: "hi" }] }),
    /Request failed: 400/
  );
  assert.equal(calls, 1);
});
