import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setSharedReadline,
  setAutoApprove,
  requestPermission,
  confirmPlan,
  askClarifyingQuestion,
  resetSessionPermissions,
  PermissionDenied,
} from "../src/lib/permissions.js";

/** Runs `fn` with process.stdin.isTTY forced to true and a fake readline
 *  that answers every question with `answer`, restoring both afterward
 *  (but leaving any session-remembered permission state for the caller to
 *  inspect - callers that use that must reset it themselves). */
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

test("requestPermission accepts the exact numbered/letter answers", async () => {
  await withInteractiveAnswer("1", () => requestPermission({ category: "write", description: "x" }));
  await withInteractiveAnswer("y", () => requestPermission({ category: "write", description: "x" }));
  await withInteractiveAnswer("yes", () => requestPermission({ category: "write", description: "x" }));
});

test("requestPermission accepts a natural-language affirmative phrasing, not just an exact 'yes'", async () => {
  await withInteractiveAnswer("yes go ahead", () => requestPermission({ category: "write", description: "x" }));
  await withInteractiveAnswer("yeah sure", () => requestPermission({ category: "write", description: "x" }));
});

test("requestPermission treats 'yes and don't ask again this session' as the remember choice, not just yes", async () => {
  await withInteractiveAnswer("yes and don't ask again this session", () =>
    requestPermission({ category: "write", description: "create KT_Guide.md" })
  );
  // The exact same action should now be remembered for the session - it
  // resolves without ever needing to ask (no TTY, no readline set here - it
  // would throw immediately if it tried).
  await requestPermission({ category: "write", description: "create KT_Guide.md" });
  resetSessionPermissions();
});

test("remembering one action does NOT blanket-approve a different action in the same category", async () => {
  await withInteractiveAnswer("2", () => requestPermission({ category: "shell", description: "npm test" }));
  // The exact command that was approved is remembered...
  await requestPermission({ category: "shell", description: "npm test" });
  // ...but a different shell command, even in the same category, still needs its own prompt.
  await assert.rejects(requestPermission({ category: "shell", description: "rm -rf /" }), PermissionDenied);
  resetSessionPermissions();
});

test("requestPermission's remember choice also accepts the exact '2' and 'always'", async () => {
  await withInteractiveAnswer("2", () => requestPermission({ category: "write", description: "x" }));
  await requestPermission({ category: "write", description: "x" });
  resetSessionPermissions();

  await withInteractiveAnswer("always", () => requestPermission({ category: "shell", description: "y" }));
  await requestPermission({ category: "shell", description: "y" });
  resetSessionPermissions();
});

test("requestPermission denies on 'no' and on an unrecognized answer", async () => {
  await assert.rejects(
    withInteractiveAnswer("no", () => requestPermission({ category: "write", description: "z1" })),
    PermissionDenied
  );
  await assert.rejects(
    withInteractiveAnswer("hmm not sure", () => requestPermission({ category: "write", description: "z2" })),
    PermissionDenied
  );
});

test("requestPermission never offers or applies the remember choice for an ALWAYS_CONFIRM category like delete", async () => {
  // "always" isn't itself a plain affirmative, and delete never checks the
  // remember branch at all - so it must still deny, not silently approve.
  await assert.rejects(
    withInteractiveAnswer("always", () => requestPermission({ category: "delete", description: "x" })),
    PermissionDenied
  );
  // And nothing got remembered - a later delete still needs a fresh prompt (no
  // TTY/readline here, so it throws immediately if it tries to ask again).
  await assert.rejects(
    requestPermission({ category: "delete", description: "should still need to ask" }),
    PermissionDenied
  );
});

test("confirmPlan accepts a natural-language affirmative and rejects everything else", async () => {
  const approved = await withInteractiveAnswer("yeah that looks right", () => confirmPlan("Title", "body"));
  assert.equal(approved, true);

  const denied = await withInteractiveAnswer("no, change it", () => confirmPlan("Title", "body"));
  assert.equal(denied, false);
});

test("askClarifyingQuestion returns the free-typed answer when there are no options", async () => {
  const answer = await withInteractiveAnswer("use TypeScript", () => askClarifyingQuestion("Which language?"));
  assert.equal(answer, "use TypeScript");
});

test("askClarifyingQuestion resolves a numbered choice against the options list", async () => {
  const answer = await withInteractiveAnswer("2", () =>
    askClarifyingQuestion("Which one?", ["first", "second", "third"])
  );
  assert.equal(answer, "second");
});

test("askClarifyingQuestion falls back to the raw text when the options list doesn't match a number", async () => {
  const answer = await withInteractiveAnswer("neither, do something else", () =>
    askClarifyingQuestion("Which one?", ["first", "second"])
  );
  assert.equal(answer, "neither, do something else");
});

test("askClarifyingQuestion returns null in a non-interactive session - nobody to ask", async () => {
  const originalIsTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  try {
    const answer = await askClarifyingQuestion("Which one?");
    assert.equal(answer, null);
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
  }
});

test("askClarifyingQuestion returns null when auto-approve is on - a scripted run has nobody attending it", async () => {
  setAutoApprove(true);
  try {
    const answer = await withInteractiveAnswer("this should never be read", () => askClarifyingQuestion("Which one?"));
    assert.equal(answer, null);
  } finally {
    setAutoApprove(false);
  }
});
