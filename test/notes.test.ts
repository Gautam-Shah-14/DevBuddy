import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addProjectNote, NOTES_CHAR_LIMIT, removeProjectNote, renderProjectNotes, replaceProjectNote } from "../src/lib/notes.js";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "devbuddy-notes-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("renderProjectNotes returns '' when there are no notes yet", () =>
  withTempDir((dir) => {
    assert.equal(renderProjectNotes(join(dir, "memory.json")), "");
  }));

test("addProjectNote creates the file (and missing parent dirs) and renderProjectNotes shows it, numbered, with a usage header", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "nested", "memory.json");
    const result = addProjectNote(notesFile, "this project has no git repo");
    assert.equal(result.ok, true);
    const rendered = renderProjectNotes(notesFile);
    assert.match(rendered, /^\[\d+% - \d+\/\d+ chars\]/);
    assert.match(rendered, /1\. this project has no git repo/);
  }));

test("addProjectNote rejects an empty note", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    const result = addProjectNote(notesFile, "   ");
    assert.equal(result.ok, false);
    assert.match(result.message, /cannot be empty/);
  }));

test("addProjectNote rejects an exact duplicate as a no-op, not an error", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    addProjectNote(notesFile, "the build command is npm run build");
    const second = addProjectNote(notesFile, "the build command is npm run build");
    assert.equal(second.ok, true);
    assert.match(second.message, /no duplicate/i);
    // still only one entry
    const rendered = renderProjectNotes(notesFile);
    assert.equal((rendered.match(/npm run build/g) ?? []).length, 1);
  }));

test("addProjectNote refuses once the combined character budget would be exceeded, listing current entries", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    addProjectNote(notesFile, "a".repeat(NOTES_CHAR_LIMIT - 10));
    const result = addProjectNote(notesFile, "b".repeat(50));
    assert.equal(result.ok, false);
    assert.match(result.message, /exceed the limit/);
    assert.match(result.message, /Consolidate first/);
    assert.match(result.message, /Current notes:/);
  }));

test("replaceProjectNote overwrites the whole matched entry via a unique substring", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    addProjectNote(notesFile, "User prefers dark mode in all editors");
    const result = replaceProjectNote(notesFile, "dark mode", "User prefers light mode in VS Code, dark mode in terminal");
    assert.equal(result.ok, true);
    const rendered = renderProjectNotes(notesFile);
    assert.match(rendered, /light mode in VS Code, dark mode in terminal/);
    assert.ok(!rendered.includes("User prefers dark mode in all editors"));
  }));

test("replaceProjectNote errors on an ambiguous substring matching multiple notes", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    addProjectNote(notesFile, "project uses npm for the frontend");
    addProjectNote(notesFile, "project uses npm for the backend too");
    const result = replaceProjectNote(notesFile, "npm", "irrelevant");
    assert.equal(result.ok, false);
    assert.match(result.message, /matches 2 saved notes/);
  }));

test("replaceProjectNote errors when nothing matches the given substring", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    addProjectNote(notesFile, "some note");
    const result = replaceProjectNote(notesFile, "nonexistent", "irrelevant");
    assert.equal(result.ok, false);
    assert.match(result.message, /no saved note contains/);
  }));

test("removeProjectNote deletes the single matched note", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    addProjectNote(notesFile, "stale fact from an earlier session");
    addProjectNote(notesFile, "still-relevant fact");
    const result = removeProjectNote(notesFile, "stale fact");
    assert.equal(result.ok, true);
    const rendered = renderProjectNotes(notesFile);
    assert.ok(!rendered.includes("stale fact"));
    assert.match(rendered, /still-relevant fact/);
  }));

test("a corrupt notes file is treated as empty rather than crashing", () =>
  withTempDir((dir) => {
    const notesFile = join(dir, "memory.json");
    writeFileSync(notesFile, "{ not valid json");
    assert.equal(renderProjectNotes(notesFile), "");
    const result = addProjectNote(notesFile, "fresh note after corruption");
    assert.equal(result.ok, true);
  }));
