import { test } from "node:test";
import assert from "node:assert/strict";
import { printBanner } from "../src/lib/banner.js";

function captureStdout(fn: () => void): string {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = ((chunk: string) => {
    out += chunk;
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return out;
}

function withColumns<T>(columns: number | undefined, fn: () => T): T {
  const original = process.stdout.columns;
  Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process.stdout, "columns", { value: original, configurable: true });
  }
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

test("printBanner renders the compact single-line wordmark when the terminal is too narrow", () => {
  const out = withColumns(60, () => captureStdout(() => printBanner()));
  const stripped = stripAnsi(out);
  assert.ok(stripped.includes("DevBuddy"));
  assert.ok(stripped.includes("local-first CLI developer agent"));
  // No flame art / figlet block lines - every line is short enough to never wrap at 60 columns.
  const lines = stripped.split("\n").filter((l) => l.length > 0);
  for (const line of lines) assert.ok(line.length <= 60, `line too wide for a 60-column terminal: "${line}"`);
});

test("printBanner renders the full flame+figlet banner when the terminal is wide enough", () => {
  const out = withColumns(120, () => captureStdout(() => printBanner()));
  const stripped = stripAnsi(out);
  // The full banner's figlet block art doesn't contain the literal word "DevBuddy" as text
  // (it's ANSI Shadow block glyphs), but it's many lines long, unlike the 4-line compact banner.
  const lines = stripped.split("\n");
  assert.ok(lines.length > 10, `expected the full multi-line banner, got ${lines.length} lines`);
});

test("printBanner falls back to compact when stdout isn't a real TTY (columns undefined)", () => {
  const out = withColumns(undefined, () => captureStdout(() => printBanner()));
  const stripped = stripAnsi(out);
  assert.ok(stripped.includes("DevBuddy"));
  const lines = stripped.split("\n").filter((l) => l.length > 0);
  assert.ok(lines.length <= 4, `expected the compact banner, got ${lines.length} non-empty lines`);
});
