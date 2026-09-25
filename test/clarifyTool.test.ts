import { test } from "node:test";
import assert from "node:assert/strict";
import { setSharedReadline, setAutoApprove } from "../src/lib/permissions.js";
import { clarifyTool } from "../src/tools/clarifyTool.js";
import type { ToolContext } from "../src/tools/types.js";

async function withInteractiveAnswer<T>(answer: string, fn: () => Promise<T>): Promise<T> {
  const originalIsTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  setSharedReadline({ question: async () => answer } as never);
  try {
    return await fn();
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    setSharedReadline(null);
    setAutoApprove(false);
  }
}

const ctx = {} as ToolContext; // clarifyTool.execute never touches ctx

test("clarify returns the user's answer, prefixed for the model to recognize as a real reply", async () => {
  const result = await withInteractiveAnswer("use the existing config file", () =>
    clarifyTool.execute({ question: "Which config should I use?" }, ctx)
  );
  assert.equal(result, "User answered: use the existing config file");
});

test("clarify resolves a numbered choice against its options list", async () => {
  const result = await withInteractiveAnswer("1", () =>
    clarifyTool.execute({ question: "Which one?", options: ["keep localhost", "switch to 127.0.0.1"] }, ctx)
  );
  assert.equal(result, "User answered: keep localhost");
});

test("clarify errors without a question", async () => {
  const result = await clarifyTool.execute({}, ctx);
  assert.equal(result, 'Error: "question" is required');
});

test("clarify tells the model to proceed on its own judgment in a non-interactive session", async () => {
  const originalIsTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  try {
    const result = await clarifyTool.execute({ question: "Which one?" }, ctx);
    assert.match(result, /No user is available to answer/);
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
  }
});
