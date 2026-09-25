import { askClarifyingQuestion } from "../lib/permissions.js";
import type { ToolDefinition } from "./types.js";

export const clarifyTool: ToolDefinition = {
  name: "clarify",
  description:
    "Ask the user a clarifying question before proceeding, when a request is genuinely ambiguous - specifically, " +
    "when the ambiguity would change which tool you call or what you'd do, not for questions with an obvious " +
    "default interpretation. Prefer acting on a reasonable default and stating your assumption over calling this " +
    "for low-stakes ambiguity. Do not use this to confirm a risky action (shell command, file write/delete, git " +
    "push/pull) - those already have their own confirmation prompt.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask the user" },
      options: {
        type: "array",
        description: "Optional short list of choices to present as a numbered menu, if the answer is a pick-one",
        items: { type: "string" },
      },
    },
    required: ["question"],
  },
  async execute(args) {
    const question = String(args.question ?? "");
    if (!question) return "Error: \"question\" is required";
    const options = Array.isArray(args.options) ? (args.options as unknown[]).map(String) : undefined;

    const answer = await askClarifyingQuestion(question, options);
    if (answer === null) {
      return "No user is available to answer (non-interactive session) - proceed using your best judgment and state your assumptions explicitly.";
    }
    return `User answered: ${answer}`;
  },
};
