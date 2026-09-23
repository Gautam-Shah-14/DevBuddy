import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveContinueSessionId, resolveResumePickerAnswer } from "../src/commands/chat.js";
import { ProjectMemory, type SessionSummary } from "../src/lib/memory.js";

function withTempProject<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-chat-resume-"));
  try {
    return fn(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

const fakeSessions: SessionSummary[] = [
  { id: 5, startedAt: "2026-01-03T00:00:00Z", endedAt: "2026-01-03T01:00:00Z", provider: "ollama", model: "llama3.1", messageCount: 4, firstUserMessage: "third" },
  { id: 3, startedAt: "2026-01-02T00:00:00Z", endedAt: "2026-01-02T01:00:00Z", provider: "ollama", model: "llama3.1", messageCount: 2, firstUserMessage: "second" },
  { id: 1, startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T01:00:00Z", provider: "ollama", model: "llama3.1", messageCount: 2, firstUserMessage: "first" },
];

test("resolveContinueSessionId picks the first (most recent) session", () => {
  assert.equal(resolveContinueSessionId(fakeSessions), 5);
});

test("resolveContinueSessionId returns null when there are no sessions", () => {
  assert.equal(resolveContinueSessionId([]), null);
});

test("resolveResumePickerAnswer treats an in-range number as a list position", () => {
  assert.equal(resolveResumePickerAnswer("1", fakeSessions), 5); // position 1 -> the newest session, id 5
  assert.equal(resolveResumePickerAnswer("3", fakeSessions), 1); // position 3 -> the oldest listed, id 1
});

test("resolveResumePickerAnswer treats an out-of-range number as a literal session id", () => {
  assert.equal(resolveResumePickerAnswer("42", fakeSessions), 42);
});

test("resolveResumePickerAnswer returns null for a blank or non-numeric answer", () => {
  assert.equal(resolveResumePickerAnswer("", fakeSessions), null);
  assert.equal(resolveResumePickerAnswer("   ", fakeSessions), null);
  assert.equal(resolveResumePickerAnswer("nope", fakeSessions), null);
});

test("reopenSession clears ended_at and updates provider/model, and getSessionMessages round-trips the transcript", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("ollama", "llama3.1");
    memory.addMessage(sessionId, { role: "system", content: "you are devbuddy" });
    memory.addMessage(sessionId, { role: "user", content: "hello" });
    memory.addMessage(sessionId, { role: "assistant", content: "hi there" });
    memory.endSession(sessionId);

    const beforeReopen = memory.listSessions(1)[0];
    assert.ok(beforeReopen.endedAt !== null);

    memory.reopenSession(sessionId, "anthropic", "claude-sonnet-5");
    const afterReopen = memory.listSessions(1)[0];
    assert.equal(afterReopen.endedAt, null);
    assert.equal(afterReopen.provider, "anthropic");
    assert.equal(afterReopen.model, "claude-sonnet-5");

    const transcript = memory.getSessionMessages(sessionId);
    assert.deepEqual(
      transcript.map((m) => [m.role, m.content]),
      [
        ["system", "you are devbuddy"],
        ["user", "hello"],
        ["assistant", "hi there"],
      ]
    );
    // tool_calls/tool_call_id must never leak into a resumed history - see the note on getSessionMessages
    for (const m of transcript) {
      assert.equal(m.tool_calls, undefined);
      assert.equal(m.tool_call_id, undefined);
    }

    memory.close();
  }));

test("getSessionMessages returns [] for a session id that doesn't exist, distinguishing it from an empty session", () =>
  withTempProject((projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    assert.deepEqual(memory.getSessionMessages(999), []);
    memory.close();
  }));
