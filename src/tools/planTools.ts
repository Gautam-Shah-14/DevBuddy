import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { confirmPlan } from "../lib/permissions.js";
import type { ToolDefinition } from "./types.js";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const proposePlanTool: ToolDefinition = {
  name: "propose_plan",
  description:
    "For a large or multi-step task (new feature, refactor, migration), propose a written plan and pause for user approval BEFORE making any file changes, shell commands, or commits. Do not call this for small, single-step requests.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title for the plan" },
      steps: {
        type: "array",
        description: "Ordered list of steps the plan consists of",
        items: { type: "string" },
      },
      rationale: { type: "string", description: "Brief explanation of the approach and any tradeoffs" },
    },
    required: ["title", "steps"],
  },
  async execute(args, ctx) {
    const title = String(args.title);
    const steps = (args.steps as unknown[]).map((s) => String(s));
    const rationale = args.rationale ? String(args.rationale) : "";

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${timestamp}-${slugify(title)}.md`;
    const filePath = join(ctx.projectPaths.plansDir, fileName);

    const body = [
      `# ${title}`,
      "",
      `Status: pending`,
      `Created: ${new Date().toISOString()}`,
      "",
      rationale ? `## Rationale\n\n${rationale}\n` : "",
      "## Steps",
      "",
      ...steps.map((s, i) => `${i + 1}. ${s}`),
      "",
    ]
      .filter((l) => l !== "")
      .join("\n");

    writeFileSync(filePath, body);
    const planId = ctx.memory.recordPlan(ctx.sessionId, filePath, title);

    const displayText = ["## Rationale\n" + rationale, "", "## Steps", ...steps.map((s, i) => `${i + 1}. ${s}`)]
      .filter(Boolean)
      .join("\n");

    const approved = await confirmPlan(title, displayText);
    ctx.memory.updatePlanStatus(planId, approved ? "approved" : "rejected");

    if (approved) {
      return `Plan "${title}" approved by the user (saved to ${filePath}). Proceed with executing the steps.`;
    }
    return `Plan "${title}" was rejected by the user (saved to ${filePath} for reference). Do not execute it. Ask the user what they'd like changed instead.`;
  },
};
