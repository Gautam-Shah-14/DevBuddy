import { addProjectNote, removeProjectNote, replaceProjectNote } from "../lib/notes.js";
import type { ToolDefinition } from "./types.js";

export const rememberTool: ToolDefinition = {
  name: "remember",
  description:
    "Manage short, durable notes about this project or task for your own future reference - facts you " +
    'discovered (e.g. "this project has no git repo", "the build command is npm run build"), decisions made, ' +
    "or things already done - so you don't rediscover, re-ask, or redo them later in this conversation or a " +
    "future session. Notes share a small combined character budget: action \"add\" adds a new one (rejected if " +
    "it would exceed the budget - consolidate with \"replace\"/\"remove\" first, using a short unique substring " +
    "of the note to identify it), \"replace\" overwrites a whole matched note with new content, \"remove\" " +
    "deletes a matched note. Never store full file contents or anything sensitive (secrets, API keys, credentials).",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["add", "replace", "remove"], description: "Which operation to perform" },
      note: { type: "string", description: "For action \"add\": the fact, decision, or completed action to remember" },
      old_text: {
        type: "string",
        description: 'For "replace"/"remove": a short substring uniquely identifying the note to change',
      },
      content: { type: "string", description: 'For action "replace": the complete new text for the matched note' },
    },
    required: ["action"],
  },
  async execute(args, ctx) {
    const action = String(args.action ?? "add");
    const notesFile = ctx.projectPaths.notesFile;

    if (action === "add") {
      if (!args.note) return "Error: action \"add\" requires a \"note\"";
      return addProjectNote(notesFile, String(args.note)).message;
    }
    if (action === "replace") {
      if (!args.old_text || !args.content) return "Error: action \"replace\" requires \"old_text\" and \"content\"";
      return replaceProjectNote(notesFile, String(args.old_text), String(args.content)).message;
    }
    if (action === "remove") {
      if (!args.old_text) return "Error: action \"remove\" requires \"old_text\"";
      return removeProjectNote(notesFile, String(args.old_text)).message;
    }
    return `Error: unknown action "${action}" - use "add", "replace", or "remove"`;
  },
};
