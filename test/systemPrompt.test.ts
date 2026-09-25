import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/lib/agent.js";
import type { ToolDefinition } from "../src/tools/types.js";

const fakeTool: ToolDefinition = {
  name: "fake_tool",
  description: "a fake tool",
  parameters: { type: "object" },
  async execute() {
    return "";
  },
};

test("buildSystemPrompt omits the notes section entirely when there are no saved notes", () => {
  const prompt = buildSystemPrompt([fakeTool], [], "base prompt");
  assert.ok(!prompt.includes("Notes you've already saved"));
});

test("buildSystemPrompt includes saved project notes verbatim when given some", () => {
  const notes = "- [2026-01-01T00:00:00.000Z] this project has no git repo";
  const prompt = buildSystemPrompt([fakeTool], [], "base prompt", notes);
  assert.match(prompt, /Notes you've already saved about this project/);
  assert.match(prompt, /this project has no git repo/);
});

test("buildSystemPrompt tells the model to use the remember tool", () => {
  const prompt = buildSystemPrompt([fakeTool], [], "base prompt");
  assert.match(prompt, /\bremember\b.*right after you learn something/i);
});
