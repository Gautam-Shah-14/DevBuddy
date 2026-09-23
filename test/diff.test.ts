import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDiff } from "../src/lib/diff.js";

function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

test("formatDiff returns null when content is identical", () => {
  assert.equal(formatDiff("same\ncontent\n", "same\ncontent\n"), null);
});

test("formatDiff marks a changed line with +/- and keeps surrounding context", () => {
  const oldText = "a\nb\nc\nd\ne\n";
  const newText = "a\nb\nX\nd\ne\n";
  const out = strip(formatDiff(oldText, newText)!);
  assert.match(out, /- c/);
  assert.match(out, /\+ X/);
  assert.match(out, /  b/);
  assert.match(out, /  d/);
});

test("formatDiff treats an empty old text as a pure addition (new file)", () => {
  const out = strip(formatDiff("", "line one\nline two")!);
  assert.match(out, /\+ line one/);
  assert.match(out, /\+ line two/);
});

test("formatDiff treats an empty new text as a pure removal (deleted file)", () => {
  const out = strip(formatDiff("line one\nline two", "")!);
  assert.match(out, /- line one/);
  assert.match(out, /- line two/);
});

test("formatDiff collapses distant unchanged lines into an omitted-lines marker", () => {
  const oldLines = Array.from({ length: 50 }, (_, i) => `line${i}`);
  const newLines = [...oldLines];
  newLines[25] = "changed";
  const out = strip(formatDiff(oldLines.join("\n"), newLines.join("\n"))!);
  assert.match(out, /unchanged lines/);
});
