import chalk from "chalk";
import { getConfig } from "./config.js";
import type { ChatMessage, ChatProvider, ToolCall } from "../providers/index.js";
import type { ProjectMemory } from "./memory.js";
import type { ProjectPaths } from "./project.js";
import type { ToolDefinition } from "../tools/index.js";
import { toOllamaToolSpec } from "../tools/index.js";
import { SandboxViolation } from "./sandbox.js";
import { PermissionDenied } from "./permissions.js";
import type { Skill } from "./skills.js";

const MAX_TOOL_ITERATIONS = 15;

const REACT_FALLBACK_INSTRUCTIONS = `
If your model runtime does not support structured tool calling, you may instead
call a tool by responding with ONLY a single fenced block, nothing else:

\`\`\`tool_call
{"name": "<tool_name>", "arguments": { ... }}
\`\`\`

Wait for the tool result before continuing. Never fabricate tool results yourself.
`;

export function buildSystemPrompt(tools: ToolDefinition[], skills: Skill[]): string {
  const { systemPrompt } = getConfig();
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const skillList =
    skills.length > 0
      ? `\nAvailable skills (call use_skill with the exact name to load one before following it):\n` +
        skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
      : "";
  return [
    systemPrompt,
    "",
    "You have access to the following tools:",
    toolList,
    skillList,
    REACT_FALLBACK_INSTRUCTIONS,
    "",
    "For any large or multi-step task (new feature, refactor, migration), call propose_plan " +
      "before making changes and wait for approval. For small, single-step requests, just do the work directly.",
  ].join("\n");
}

function parseReactToolCall(content: string): ToolCall | null {
  const match = content.match(/```tool_call\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as { name: string; arguments: Record<string, unknown> };
    if (!parsed.name) return null;
    return { function: { name: parsed.name, arguments: parsed.arguments ?? {} } };
  } catch {
    return null;
  }
}

export interface RunAgentTurnOptions {
  model: string;
  provider: ChatProvider;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  skills: Skill[];
  projectRoot: string;
  projectPaths: ProjectPaths;
  memory: ProjectMemory;
  sessionId: number;
  onToken: (token: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
}

/**
 * Runs one full agent turn: repeatedly calls the model, executes any tool
 * calls it makes (native or ReAct-fallback), feeds results back, until the
 * model produces a plain answer with no further tool calls (or the
 * iteration cap is hit).
 */
export interface AgentTurnResult {
  content: string;
  messages: ChatMessage[];
}

export async function runAgentTurn(opts: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const { model, provider, projectRoot, projectPaths, memory, sessionId, tools, skills } = opts;
  const messages = [...opts.messages];
  const toolSpecs = tools.map(toOllamaToolSpec);
  const getTool = (name: string) => tools.find((t) => t.name === name);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await provider.streamChat({ model, messages, tools: toolSpecs, onToken: opts.onToken });

    const toolCalls: ToolCall[] =
      result.toolCalls.length > 0
        ? result.toolCalls
        : (() => {
            const fallback = parseReactToolCall(result.content);
            return fallback ? [fallback] : [];
          })();

    const assistantMessage: ChatMessage = { role: "assistant", content: result.content };
    messages.push(assistantMessage);
    memory.addMessage(sessionId, assistantMessage, toolCalls.length ? JSON.stringify(toolCalls) : undefined);

    if (toolCalls.length === 0) {
      return { content: result.content, messages };
    }

    for (const call of toolCalls) {
      const tool = getTool(call.function.name);
      opts.onToolStart?.(call.function.name, call.function.arguments);

      let resultText: string;
      if (!tool) {
        resultText = `Error: unknown tool "${call.function.name}"`;
      } else {
        try {
          resultText = await tool.execute(call.function.arguments, {
            projectRoot,
            projectPaths,
            memory,
            sessionId,
            skills,
          });
        } catch (err) {
          if (err instanceof SandboxViolation || err instanceof PermissionDenied) {
            resultText = `Error: ${err.message}`;
          } else {
            resultText = `Error running ${call.function.name}: ${(err as Error).message}`;
          }
        }
      }

      opts.onToolResult?.(call.function.name, resultText);
      const toolMessage: ChatMessage = { role: "tool", content: resultText, tool_name: call.function.name };
      messages.push(toolMessage);
      memory.addMessage(sessionId, toolMessage);
    }
  }

  const giveUpMessage = `Reached the maximum of ${MAX_TOOL_ITERATIONS} tool calls for this turn without a final answer. Try breaking the request into smaller steps.`;
  console.log(chalk.red(giveUpMessage));
  return { content: giveUpMessage, messages };
}
