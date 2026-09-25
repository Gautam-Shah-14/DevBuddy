import chalk from "chalk";
import { getConfig } from "./config.js";
import type { ChatMessage, ChatProvider, RetryInfo, ToolCall } from "../providers/index.js";
import type { ProjectMemory } from "./memory.js";
import type { ProjectPaths } from "./project.js";
import type { ToolDefinition } from "../tools/index.js";
import { toOllamaToolSpec } from "../tools/index.js";
import { SandboxViolation } from "./sandbox.js";
import { PermissionDenied } from "./permissions.js";
import type { Skill } from "./skills.js";
import { GuardrailsBlocked, type GuardrailsEngine } from "./guardrails/engine.js";
import { detectVerifyCommand, runVerification, MUTATING_TOOLS, type VerifyResult } from "./verify.js";

const MAX_TOOL_ITERATIONS = 15;
const MAX_VERIFY_ATTEMPTS = 2;

export interface VerifyEvent {
  command: string;
  status: "running" | "passed" | "failed";
  output?: string;
}

const REACT_FALLBACK_INSTRUCTIONS = `
If your model runtime does not support structured tool calling, you may instead
call a tool by responding with ONLY a single fenced block, nothing else:

\`\`\`tool_call
{"name": "<tool_name>", "arguments": { ... }}
\`\`\`

Wait for the tool result before continuing. Never fabricate tool results yourself.
`;

export function buildSystemPrompt(tools: ToolDefinition[], skills: Skill[], systemPrompt?: string): string {
  const effectiveSystemPrompt = systemPrompt ?? getConfig().systemPrompt;
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const skillList =
    skills.length > 0
      ? `\nAvailable skills (call use_skill with the exact name to load one before following it):\n` +
        skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
      : "";
  return [
    effectiveSystemPrompt,
    "",
    "You have access to the following tools:",
    toolList,
    skillList,
    "",
    "Before reading or editing a file you haven't already seen in this conversation, locate it first: " +
      "use search_files (a regex content search, like grep -rn) to find where something is defined or used, " +
      "and list_files to see what's in a directory. Do not guess a file's path or content, and do not ask the " +
      "user where something is - search the project for it yourself.",
    "",
    "Before writing a document ABOUT this project (a README, a guide, a summary, onboarding notes, etc.), " +
      "gather real context first: list_files to see the project's layout, and read_file on files like " +
      "package.json and any existing README to learn what the project actually is, what it does, and how it's " +
      "used. Never invent generic placeholder content ('Clone the repository', 'Run npm install', etc.) - base " +
      "what you write on what you actually found in the project.",
    "",
    "If a task needs information you don't already know for certain - a library's current API, a version " +
      "number, an error message you don't recognize, a fact outside this project - use web_search rather than " +
      "guessing or answering from possibly outdated training data.",
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

const REACT_FENCE_PREFIX = "```tool_call";

/**
 * Wraps a caller's onToken so a ReAct-fallback tool-call fence (see
 * REACT_FALLBACK_INSTRUCTIONS) never reaches the terminal as raw text - it's
 * an internal instruction-following mechanic, not a user-facing message, and
 * the tool call it triggers is already shown via onToolStart's own bullet.
 *
 * Buffers only the start of a turn's content while it could still plausibly
 * become that fence: the moment it diverges from the "```tool_call" prefix,
 * everything buffered so far is flushed unchanged and every later token
 * passes straight through - so ordinary prose (including one that happens to
 * open with an unrelated ``` code fence) streams normally with no added
 * delay beyond the few characters needed to tell them apart. If the prefix
 * matches in full, the rest of that message's tokens are silently dropped;
 * if the stream ends before the sniff resolves either way (a very short
 * reply), whatever's left in the buffer is flushed once streaming completes.
 */
function wrapOnTokenForReactSniffing(onToken: (token: string) => void): {
  onToken: (token: string) => void;
  flush: () => void;
} {
  let buffer = "";
  let state: "sniffing" | "passthrough" | "suppressing" = "sniffing";

  return {
    onToken(token) {
      if (state === "passthrough") {
        onToken(token);
        return;
      }
      if (state === "suppressing") return;

      buffer += token;
      const trimmed = buffer.replace(/^\s+/, "");
      const compareLen = Math.min(trimmed.length, REACT_FENCE_PREFIX.length);
      if (trimmed.slice(0, compareLen) !== REACT_FENCE_PREFIX.slice(0, compareLen)) {
        onToken(buffer);
        buffer = "";
        state = "passthrough";
        return;
      }
      if (trimmed.length >= REACT_FENCE_PREFIX.length) {
        state = "suppressing";
        buffer = "";
      }
    },
    flush() {
      if (state === "sniffing" && buffer) onToken(buffer);
    },
  };
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
  guardrails?: GuardrailsEngine;
  /** Overrides getConfig().verifyCommand - callers that resolve an effective,
   *  project-config-aware verifyCommand should pass it through here. */
  verifyCommand?: string;
  onToken: (token: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  onVerify?: (event: VerifyEvent) => void;
  /** Called when the provider retries its request after a transient failure (network error, HTTP 429/5xx). */
  onRetry?: (info: RetryInfo) => void;
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
  const verifyCommand = detectVerifyCommand(projectRoot, opts.verifyCommand ?? getConfig().verifyCommand);
  let filesMutatedSinceVerify = false;
  let verifyAttempts = 0;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    // Guardrails apply at the boundary right before content leaves the
    // machine to the AI provider - local tools (file read/edit, etc.)
    // stay unrestricted throughout. In "block" mode, a turn whose pending
    // messages contain PII is refused before anything is sent.
    let outgoingMessages = messages;
    if (opts.guardrails) {
      try {
        outgoingMessages = opts.guardrails.apply(messages);
      } catch (err) {
        if (err instanceof GuardrailsBlocked) {
          const blockedMessage = `${err.message}\nNothing was sent to the AI provider. Remove the sensitive content, or switch guardrails mode with "devbuddy guardrails set", and try again.`;
          const assistantMessage: ChatMessage = { role: "assistant", content: blockedMessage };
          messages.push(assistantMessage);
          memory.addMessage(sessionId, assistantMessage);
          return { content: blockedMessage, messages };
        }
        throw err;
      }
    }

    const reactSniff = wrapOnTokenForReactSniffing(opts.onToken);
    const result = await provider.streamChat({
      model,
      messages: outgoingMessages,
      tools: toolSpecs,
      onToken: reactSniff.onToken,
      onRetry: opts.onRetry,
    });
    reactSniff.flush();
    // Restore any placeholders the model echoed back before storing/returning
    // the reply - streamed tokens may transiently show a raw placeholder if
    // one lands mid-stream, but the final stored content is always restored.
    const restoredContent = opts.guardrails ? opts.guardrails.restore(result.content) : result.content;

    const rawToolCalls: ToolCall[] =
      result.toolCalls.length > 0
        ? result.toolCalls
        : (() => {
            const fallback = parseReactToolCall(restoredContent);
            return fallback ? [fallback] : [];
          })();
    // Every provider needs a stable call id to match a tool result back to its
    // call (OpenAI's tool_call_id, Anthropic's tool_use_id) - assign one when
    // the provider didn't supply it (Ollama, ReAct fallback).
    const toolCalls: ToolCall[] = rawToolCalls.map((call, idx) => ({
      ...call,
      id: call.id ?? `call_${iteration}_${idx}`,
    }));

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: restoredContent,
      tool_calls: toolCalls.length ? toolCalls : undefined,
    };
    messages.push(assistantMessage);
    memory.addMessage(
      sessionId,
      assistantMessage,
      toolCalls.length ? JSON.stringify(toolCalls) : undefined,
      result.usage
    );

    if (toolCalls.length === 0) {
      if (verifyCommand && filesMutatedSinceVerify && verifyAttempts < MAX_VERIFY_ATTEMPTS) {
        verifyAttempts++;
        filesMutatedSinceVerify = false;
        opts.onVerify?.({ command: verifyCommand, status: "running" });
        const verifyResult: VerifyResult = await runVerification(projectRoot, verifyCommand);
        opts.onVerify?.({ command: verifyCommand, status: verifyResult.passed ? "passed" : "failed", output: verifyResult.output });

        if (!verifyResult.passed) {
          const feedback: ChatMessage = {
            role: "user",
            content:
              `Self-verification failed. Running \`${verifyCommand}\` after your changes produced:\n\n` +
              `${verifyResult.output}\n\nFix the issue, then give your final answer again.`,
          };
          messages.push(feedback);
          memory.addMessage(sessionId, feedback);
          continue;
        }
      }
      return { content: restoredContent, messages };
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

      const succeeded = !resultText.startsWith("Error");
      if (MUTATING_TOOLS.has(call.function.name) && succeeded) {
        filesMutatedSinceVerify = true;
      }
      memory.addToolEvent(sessionId, call.function.name, JSON.stringify(call.function.arguments), succeeded, resultText);

      opts.onToolResult?.(call.function.name, resultText);
      const toolMessage: ChatMessage = {
        role: "tool",
        content: resultText,
        tool_name: call.function.name,
        tool_call_id: call.id,
      };
      messages.push(toolMessage);
      memory.addMessage(sessionId, toolMessage);
    }
  }

  const giveUpMessage = `Reached the maximum of ${MAX_TOOL_ITERATIONS} tool calls for this turn without a final answer. Try breaking the request into smaller steps.`;
  console.log(chalk.red(giveUpMessage));
  return { content: giveUpMessage, messages };
}
