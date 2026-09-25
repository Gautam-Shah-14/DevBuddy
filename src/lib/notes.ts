import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const MAX_NOTES_CHARS = 4000; // keep the injected block small on a local model's limited context window

/**
 * Reads the durable per-project notes file (see ProjectPaths.notesFile) for
 * injection into the system prompt. Empty string if it doesn't exist yet or
 * can't be read - callers should treat that as "no notes", not an error.
 * Kept to the most recent MAX_NOTES_CHARS so a long-lived project's notes
 * file can't grow to dominate a turn's context window; older notes still
 * exist on disk, just outside what gets reinjected.
 */
export function readProjectNotes(notesFile: string): string {
  if (!existsSync(notesFile)) return "";
  try {
    const content = readFileSync(notesFile, "utf-8").trim();
    if (content.length <= MAX_NOTES_CHARS) return content;
    return content.slice(content.length - MAX_NOTES_CHARS);
  } catch {
    return "";
  }
}

/** Appends one timestamped note (the "remember" tool's write path). */
export function appendProjectNote(notesFile: string, note: string): void {
  mkdirSync(dirname(notesFile), { recursive: true });
  const timestamp = new Date().toISOString();
  appendFileSync(notesFile, `- [${timestamp}] ${note}\n`);
}
