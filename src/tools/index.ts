import { deleteFileTool, editFileTool, readFileTool, writeFileTool } from "./fileTools.js";
import { gitCommitTool, gitDiffTool, gitFetchTool, gitPullTool, gitPushTool, gitStatusTool } from "./gitTools.js";
import { runShellTool } from "./shellTools.js";
import { listFilesTool, searchFilesTool } from "./searchTools.js";
import { proposePlanTool } from "./planTools.js";
import { useSkillTool } from "./skillTools.js";
import { webSearchTool } from "./webTools.js";
import type { ToolDefinition } from "./types.js";

export { toOllamaToolSpec } from "./types.js";
export type { ToolContext, ToolDefinition } from "./types.js";

export const builtinTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  runShellTool,
  gitStatusTool,
  gitDiffTool,
  gitFetchTool,
  gitPullTool,
  gitCommitTool,
  gitPushTool,
  searchFilesTool,
  listFilesTool,
  webSearchTool,
  proposePlanTool,
  useSkillTool,
];

export function getTool(name: string): ToolDefinition | undefined {
  return builtinTools.find((t) => t.name === name);
}
