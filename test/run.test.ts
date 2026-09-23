import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfigValue } from "../src/lib/config.js";
import { setAutoApprove } from "../src/lib/permissions.js";
import { runCommand } from "../src/commands/run.js";

function ndjsonStream(lines: unknown[]): Response {
  const body = lines.map((l) => JSON.stringify(l) + "\n").join("");
  return new Response(body, { status: 200 });
}

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-run-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

function mockOllamaFetch(chatResponses: unknown[][]): { calls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: string[] = [];
  let chatCallIndex = 0;

  globalThis.fetch = (async (url: string | URL) => {
    const href = typeof url === "string" ? url : url.toString();
    calls.push(href);
    if (href.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }
    if (href.endsWith("/api/chat")) {
      const lines = chatResponses[Math.min(chatCallIndex, chatResponses.length - 1)];
      chatCallIndex++;
      return ndjsonStream(lines);
    }
    throw new Error(`Unexpected fetch to ${href}`);
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("devbuddy run streams the final answer and captures usage, with no tool calls", async (t) => {
  setConfigValue("provider", "ollama");
  setConfigValue("host", "http://fake-ollama");
  setConfigValue("model", "test-model");
  setAutoApprove(false);

  const mock = mockOllamaFetch([
    [
      { message: { role: "assistant", content: "Hello " } },
      { message: { role: "assistant", content: "world" } },
      { message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 5, eval_count: 2 },
    ],
  ]);
  t.after(mock.restore);

  await withTempProject(async (projectRoot) => {
    await runCommand("say hi", { projectRootOverride: projectRoot, json: true });
  });

  assert.ok(mock.calls.some((c) => c.endsWith("/api/chat")));
});

test("devbuddy run --json emits a single JSON object with the final content", async (t) => {
  setConfigValue("provider", "ollama");
  setConfigValue("host", "http://fake-ollama");
  setConfigValue("model", "test-model");
  setAutoApprove(false);

  const mock = mockOllamaFetch([
    [{ message: { role: "assistant", content: "the answer" }, done: true, prompt_eval_count: 1, eval_count: 1 }],
  ]);
  t.after(mock.restore);

  const originalLog = console.log;
  const logged: string[] = [];
  console.log = (msg: string) => logged.push(msg);

  try {
    await withTempProject(async (projectRoot) => {
      await runCommand("say hi", { projectRootOverride: projectRoot, json: true });
    });
  } finally {
    console.log = originalLog;
  }

  const jsonLine = logged.join("\n");
  const parsed = JSON.parse(jsonLine);
  assert.equal(parsed.content, "the answer");
  assert.equal(parsed.provider, "ollama");
  assert.equal(parsed.model, "test-model");
  assert.equal(typeof parsed.sessionId, "number");
});

test("devbuddy run refuses a mutating tool call without --yes in a non-interactive session", async (t) => {
  setConfigValue("provider", "ollama");
  setConfigValue("host", "http://fake-ollama");
  setConfigValue("model", "test-model");
  setAutoApprove(false);

  const mock = mockOllamaFetch([
    [
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "write_file", arguments: { path: "new.txt", content: "hi" } } }],
        },
        done: true,
      },
    ],
  ]);
  t.after(mock.restore);

  const originalError = console.error;
  const errors: string[] = [];
  console.error = (msg: string) => errors.push(String(msg));

  try {
    await withTempProject(async (projectRoot) => {
      await runCommand("create new.txt", { projectRootOverride: projectRoot, json: true });
      assert.equal(existsSync(join(projectRoot, "new.txt")), false);
    });
  } finally {
    console.error = originalError;
  }

  assert.match(errors.join("\n"), /non-interactive session/);
});

test("devbuddy run --yes auto-approves a mutating tool call", async (t) => {
  setConfigValue("provider", "ollama");
  setConfigValue("host", "http://fake-ollama");
  setConfigValue("model", "test-model");

  const mock = mockOllamaFetch([
    [
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "write_file", arguments: { path: "new.txt", content: "hi there" } } }],
        },
        done: true,
      },
    ],
    [{ message: { role: "assistant", content: "done" }, done: true }],
  ]);
  t.after(() => {
    mock.restore();
    setAutoApprove(false);
  });

  await withTempProject(async (projectRoot) => {
    await runCommand("create new.txt", { projectRootOverride: projectRoot, yes: true, json: true });
    assert.equal(readFileSync(join(projectRoot, "new.txt"), "utf-8"), "hi there");
  });
});
