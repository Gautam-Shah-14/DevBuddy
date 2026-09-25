import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Total character budget across all notes combined - keeps the block injected
 * into the system prompt bounded on a small local model's limited context
 * window. Enforced on WRITE (add/replace refuse once it would be exceeded,
 * handing back the current entries so the model can consolidate first) rather
 * than silently dropping old notes on read - a note the model can no longer
 * see it saved is worse than an add it has to make room for first.
 */
export const NOTES_CHAR_LIMIT = 2000;

export interface NoteResult {
  ok: boolean;
  message: string;
}

function readEntries(notesFile: string): string[] {
  if (!existsSync(notesFile)) return [];
  try {
    const parsed = JSON.parse(readFileSync(notesFile, "utf-8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return []; // corrupt/foreign file - treat as empty rather than crash the turn
  }
}

function writeEntries(notesFile: string, entries: string[]): void {
  mkdirSync(dirname(notesFile), { recursive: true });
  writeFileSync(notesFile, JSON.stringify(entries, null, 2));
}

function totalChars(entries: string[]): number {
  return entries.reduce((sum, e) => sum + e.length, 0);
}

function numberedList(entries: string[]): string {
  return entries.map((e, i) => `${i + 1}. ${e}`).join("\n");
}

/**
 * Renders saved notes for injection into the system prompt: a numbered list
 * plus a usage line, so the model can see how close it is to the cap before
 * trying to add more. Returns "" (meaning "omit the whole section") when
 * there are no notes yet.
 */
export function renderProjectNotes(notesFile: string): string {
  const entries = readEntries(notesFile);
  if (entries.length === 0) return "";
  const used = totalChars(entries);
  const pct = Math.round((used / NOTES_CHAR_LIMIT) * 100);
  return `[${pct}% - ${used}/${NOTES_CHAR_LIMIT} chars]\n${numberedList(entries)}`;
}

/**
 * Appends a new note. Rejects an exact duplicate (returns ok:true, no-op) and
 * refuses once the combined character budget would be exceeded, handing back
 * every current entry so the model can remove/replace something stale before
 * retrying the add - all in the same turn, rather than a note silently
 * failing to persist or bumping an old one out of context unannounced.
 */
export function addProjectNote(notesFile: string, note: string): NoteResult {
  const trimmed = note.trim();
  if (!trimmed) return { ok: false, message: "Error: note cannot be empty" };

  const entries = readEntries(notesFile);
  if (entries.includes(trimmed)) {
    return { ok: true, message: "Already remembered (no duplicate added)." };
  }

  const used = totalChars(entries);
  if (used + trimmed.length > NOTES_CHAR_LIMIT) {
    return {
      ok: false,
      message:
        `Error: notes at ${used}/${NOTES_CHAR_LIMIT} chars. Adding this note (${trimmed.length} chars) would ` +
        `exceed the limit. Consolidate first - call remember with action "replace" to merge overlapping notes ` +
        `into something shorter, or "remove" a stale one - then retry this add, all in this turn.\n\n` +
        `Current notes:\n${numberedList(entries)}`,
    };
  }

  entries.push(trimmed);
  writeEntries(notesFile, entries);
  return { ok: true, message: "Remembered." };
}

/**
 * Locates the single note containing `substring`, for replace/remove. An
 * exact whole-entry match wins over partial matches (a model may reference a
 * note by quoting it back in full); otherwise `substring` must identify
 * exactly one entry - zero or multiple matches is an error listing the
 * candidates, rather than silently guessing.
 */
function findEntry(entries: string[], substring: string): { index: number } | { error: string } {
  const exact = entries.indexOf(substring);
  if (exact !== -1) return { index: exact };

  const matches = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.includes(substring));
  if (matches.length === 0) return { error: `Error: no saved note contains "${substring}".` };
  if (matches.length > 1) {
    return {
      error:
        `Error: "${substring}" matches ${matches.length} saved notes - use a longer, more specific substring.\n` +
        numberedList(matches.map((m) => m.entry)),
    };
  }
  return { index: matches[0].index };
}

/** Replaces the whole matched entry with `newContent` - `oldSubstring` only locates it,
 *  it isn't spliced out, so newContent must be the complete replacement text. */
export function replaceProjectNote(notesFile: string, oldSubstring: string, newContent: string): NoteResult {
  const trimmed = newContent.trim();
  if (!trimmed) return { ok: false, message: "Error: replacement content cannot be empty" };

  const entries = readEntries(notesFile);
  const found = findEntry(entries, oldSubstring);
  if ("error" in found) return { ok: false, message: found.error };

  const projected = totalChars(entries) - entries[found.index].length + trimmed.length;
  if (projected > NOTES_CHAR_LIMIT) {
    return {
      ok: false,
      message: `Error: this replacement would bring notes to ${projected}/${NOTES_CHAR_LIMIT} chars - shorten it, or remove another note first.`,
    };
  }

  entries[found.index] = trimmed;
  writeEntries(notesFile, entries);
  return { ok: true, message: "Replaced." };
}

/** Removes the single note matching `substring`. */
export function removeProjectNote(notesFile: string, substring: string): NoteResult {
  const entries = readEntries(notesFile);
  const found = findEntry(entries, substring);
  if ("error" in found) return { ok: false, message: found.error };

  entries.splice(found.index, 1);
  writeEntries(notesFile, entries);
  return { ok: true, message: "Removed." };
}
