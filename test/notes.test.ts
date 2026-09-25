import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendProjectNote, readProjectNotes } from "../src/lib/notes.js";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "devbuddy-notes-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readProjectNotes returns '' when the notes file doesn't exist yet", () =>
  withTempDir((dir) => {
    assert.equal(readProjectNotes(join(dir, "memory.md")), "");
  }));

test("appendProjectNote creates the file (and any missing parent dirs) and readProjectNotes reads it back", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "nested", "memory.md");
    appendProjectNote(notesFile, "this project has no git repo");
    const content = readProjectNotes(notesFile);
    assert.match(content, /this project has no git repo/);
    assert.match(content, /^- \[\d{4}-\d{2}-\d{2}T/); // timestamped bullet
  }));

test("appendProjectNote appends, it never overwrites earlier notes", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.md");
    appendProjectNote(notesFile, "first fact");
    appendProjectNote(notesFile, "second fact");
    const content = readProjectNotes(notesFile);
    assert.match(content, /first fact/);
    assert.match(content, /second fact/);
    assert.ok(content.indexOf("first fact") < content.indexOf("second fact"));
  }));

test("readProjectNotes truncates a very long notes file to its most recent portion", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.md");
    for (let i = 0; i < 2000; i++) appendProjectNote(notesFile, `fact number ${i}`);
    const content = readProjectNotes(notesFile);
    assert.ok(content.length <= 4000);
    assert.match(content, /fact number 1999/); // the most recent note survives
    assert.ok(!content.includes("fact number 0\n"), "the oldest notes should have been trimmed off");
  }));
