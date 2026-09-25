import { appendProjectNote } from "../lib/notes.js";
import type { ToolDefinition } from "./types.js";

export const rememberTool: ToolDefinition = {
  name: "remember",
  description:
    "Save a short, durable note about this project or task for your own future reference - a fact you " +
    'discovered (e.g. "this project has no git repo", "the build command is npm run build"), a decision made, ' +
    "or something already done (e.g. \"created KT_Guide.md summarizing setup and usage\") - so you don't " +
    "rediscover, re-ask, or redo it later in this conversation or a future session. Call this right after " +
    "learning or doing something worth not forgetting. Keep it to one or two sentences; don't store full file " +
    "contents or anything sensitive (secrets, API keys, credentials).",
  parameters: {
    type: "object",
    properties: { note: { type: "string", description: "The fact, decision, or completed action to remember" } },
    required: ["note"],
  },
  async execute(args, ctx) {
    const note = String(args.note).trim();
    if (!note) return "Error: note cannot be empty";
    appendProjectNote(ctx.projectPaths.notesFile, note);
    return "Remembered.";
  },
};
