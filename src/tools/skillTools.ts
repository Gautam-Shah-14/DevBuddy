import type { ToolDefinition } from "./types.js";

export const useSkillTool: ToolDefinition = {
  name: "use_skill",
  description:
    "Load the full instructions for a named skill (see the skill list in your system prompt) before following it.",
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "Exact skill name" } },
    required: ["name"],
  },
  async execute(args, ctx) {
    const skill = ctx.skills.find((s) => s.name === String(args.name));
    if (!skill) {
      const available = ctx.skills.map((s) => s.name).join(", ") || "(none)";
      return `Error: no skill named "${args.name}". Available skills: ${available}`;
    }
    return `# Skill: ${skill.name}\n\n${skill.content}`;
  },
};
