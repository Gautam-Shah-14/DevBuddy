import type { ProjectMemory } from "../lib/memory.js";
import type { ProjectPaths } from "../lib/project.js";

export interface ToolContext {
  projectRoot: string;
  projectPaths: ProjectPaths;
  memory: ProjectMemory;
  sessionId: number;
}

export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema & { description?: string }>;
  required?: string[];
  description?: string;
  items?: JsonSchema;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

/** Shape Ollama's /api/chat expects under the `tools` field. */
export function toOllamaToolSpec(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
