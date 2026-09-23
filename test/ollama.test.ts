import { test } from "node:test";
import assert from "node:assert/strict";
import { setConfigValue } from "../src/lib/config.js";
import { OllamaProvider } from "../src/providers/ollama.js";

function ndjsonStream(lines: unknown[]): Response {
  return new Response(lines.map((l) => JSON.stringify(l) + "\n").join(""), { status: 200 });
}

test("OllamaProvider.streamChat retries a transient 500 then succeeds", async (t) => {
  setConfigValue("host", "http://fake-ollama");

  const lines = [
    { message: { role: "assistant", content: "hi" } },
    { message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 1, eval_count: 1 },
  ];

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Response("busy", { status: 500 });
    return ndjsonStream(lines);
  }) as typeof fetch;

  const provider = new OllamaProvider();
  const retries: number[] = [];
  const result = await provider.streamChat({
    model: "llama3.1",
    messages: [{ role: "user", content: "hi" }],
    onRetry: (info) => retries.push(info.attempt),
  });

  assert.equal(calls, 2);
  assert.deepEqual(retries, [1]);
  assert.equal(result.content, "hi");
});

test("OllamaProvider.streamChat does not retry a 400 (bad request)", async (t) => {
  setConfigValue("host", "http://fake-ollama");

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("bad request", { status: 400, statusText: "Bad Request" });
  }) as typeof fetch;

  const provider = new OllamaProvider();
  await assert.rejects(
    () => provider.streamChat({ model: "llama3.1", messages: [{ role: "user", content: "hi" }] }),
    /Ollama request failed: 400/
  );
  assert.equal(calls, 1);
});
