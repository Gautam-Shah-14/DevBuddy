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
/** A turn with zero valid tool calls this many times in a row gives up rather
 *  than burning the rest of MAX_TOOL_ITERATIONS on a persistently confused model. */
const MAX_INVALID_TOOL_NAME_STRIKES = 3;
/** Times a malformed ReAct-fallback tool_call fence gets a "fix your JSON" retry before giving up. */
const MAX_REACT_JSON_RETRIES = 2;

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

export function buildSystemPrompt(
  tools: ToolDefinition[],
  skills: Skill[],
  systemPrompt?: string,
  projectNotes?: string
): string {
  const effectiveSystemPrompt = systemPrompt ?? getConfig().systemPrompt;
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const skillList =
    skills.length > 0
      ? `\nAvailable skills (call use_skill with the exact name to load one before following it):\n` +
        skills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
      : "";
  const notesBlock = projectNotes
    ? `\nNotes you've already saved about this project, from this conversation or an earlier session ` +
      `(use them - don't re-discover, re-ask, or redo something already recorded here):\n${projectNotes}\n`
    : "";
  return [
    effectiveSystemPrompt,
    "",
    "You have access to the following tools:",
    toolList,
    skillList,
    notesBlock,
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
    "",
    "Call remember right after you learn something worth not rediscovering later - e.g. this project has no " +
      "git repo, the build/test command, a decision you made, or a file you already created and what's in it. " +
      "Check the notes above first so you don't ask the user or redo work that's already recorded there.",
    REACT_FALLBACK_INSTRUCTIONS,
    "",
    "For any large or multi-step task (new feature, refactor, migration), call propose_plan " +
      "before making changes and wait for approval. For small, single-step requests, just do the work directly.",
    "",
    "Never say you created, wrote, saved, or ran something unless you actually called the matching tool in " +
      "this turn and it returned a result - a plan, file, or command only exists once its tool call succeeds. " +
      "Do not narrate a plan as if you already saved it; call propose_plan itself. And answer only the question " +
      "actually asked - if the user asks what a project is or does, describe what you found by reading it, don't " +
      "pivot to unrelated instructions for using this tool on some other project.",
  ].join("\n");
}

type ReactParseResult =
  | { kind: "none" }
  | { kind: "call"; call: ToolCall }
  | { kind: "malformed"; error: string };

/**
 * Parses a ReAct-fallback ```tool_call fence out of a model's raw content.
 * Distinguishes "no fence at all" (ordinary prose - the normal, non-tool-call
 * path) from "there's a fence but its JSON is broken" (kind: "malformed"),
 * so the caller can ask the model to fix and retry instead of silently
 * treating the broken fence as if it were the model's real final answer.
 */
function parseReactToolCall(content: string): ReactParseResult {
  const match = content.match(/```tool_call\s*\n([\s\S]*?)```/);
  if (!match) return { kind: "none" };
  try {
    const parsed = JSON.parse(match[1].trim()) as { name?: string; arguments?: Record<string, unknown> };
    if (!parsed.name) return { kind: "malformed", error: 'missing required "name" field' };
    return { kind: "call", call: { function: { name: parsed.name, arguments: parsed.arguments ?? {} } } };
  } catch (err) {
    return { kind: "malformed", error: (err as Error).message };
  }
}

/** Case/word-boundary-insensitive Levenshtein edit distance, used only to repair
 *  an otherwise-unrecognized tool name against the small, fixed set of real ones. */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Repairs a hallucinated/malformed tool name a model produced (wrong case,
 * "-" instead of "_", a stray "Tool"/"_tool" suffix, or a small typo) against
 * the actual set of available tool names. Returns the repaired name if
 * confident, otherwise null - deliberately conservative (exact match after
 * normalization, or a single unambiguous close match within a small edit
 * distance) since silently routing a call to the WRONG tool is worse than
 * asking the model to try again.
 */
function repairToolName(name: string, validNames: Set<string>): string | null {
  if (!name) return null;
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[-\s]+/g, "_");
  const candidates = new Set<string>([name, normalize(name)]);
  for (const c of [...candidates]) {
    const stripped = c.replace(/_?tool$/, "");
    if (stripped && stripped !== c) candidates.add(stripped);
  }
  for (const c of candidates) {
    if (validNames.has(c)) return c;
  }

  const normalized = normalize(name);
  const close = [...validNames].filter((valid) => {
    const maxDistance = normalized.length <= 6 ? 1 : 2; // tighter tolerance for short names
    return editDistance(normalized, valid) <= maxDistance;
  });
  return close.length === 1 ? close[0] : null;
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
  const validToolNames = new Set(tools.map((t) => t.name));
  const getTool = (name: string) => tools.find((t) => t.name === name);
  const verifyCommand = detectVerifyCommand(projectRoot, opts.verifyCommand ?? getConfig().verifyCommand);
  let filesMutatedSinceVerify = false;
  let verifyAttempts = 0;
  let invalidToolNameStrikes = 0;
  let reactJsonRetries = 0;

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

    const reactResult: ReactParseResult = result.toolCalls.length > 0 ? { kind: "none" } : parseReactToolCall(restoredContent);
    const rawToolCalls: ToolCall[] = result.toolCalls.length > 0 ? result.toolCalls : reactResult.kind === "call" ? [reactResult.call] : [];
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

    // The model attempted the ReAct-fallback fence but its JSON didn't parse -
    // ask it to fix and retry (bounded) instead of silently treating the raw,
    // broken fence as if it were the model's real final answer.
    if (toolCalls.length === 0 && reactResult.kind === "malformed") {
      reactJsonRetries++;
      if (reactJsonRetries > MAX_REACT_JSON_RETRIES) {
        const giveUp = `Model produced malformed tool_call JSON ${MAX_REACT_JSON_RETRIES + 1} times in a row (${reactResult.error}). Giving up on this turn.`;
        console.log(chalk.red(giveUp));
        return { content: giveUp, messages };
      }
      const feedback: ChatMessage = {
        role: "user",
        content:
          `Your \`\`\`tool_call fence had invalid JSON: ${reactResult.error}. Respond again with ONLY a single ` +
          `fenced tool_call block containing valid JSON: {"name": "<tool_name>", "arguments": { ... }}.`,
      };
      messages.push(feedback);
      memory.addMessage(sessionId, feedback);
      continue;
    }
    reactJsonRetries = 0;

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

    let anyValidToolThisIteration = false;
    for (const call of toolCalls) {
      let tool = getTool(call.function.name);
      if (!tool) {
        const repaired = repairToolName(call.function.name, validToolNames);
        if (repaired) {
          console.log(chalk.dim(`  (auto-repaired tool name "${call.function.name}" -> "${repaired}")`));
          call.function.name = repaired;
          tool = getTool(repaired);
        }
      }
      if (tool) anyValidToolThisIteration = true;
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

    // A model that keeps hallucinating tool names even after the repair
    // attempt above isn't going to recover on its own - stop wasting the rest
    // of MAX_TOOL_ITERATIONS on it. Strikes only advance when NO call in the
    // iteration resolved to a real tool, so one bad call in an otherwise-valid
    // batch doesn't trip this.
    if (anyValidToolThisIteration) {
      invalidToolNameStrikes = 0;
    } else if (++invalidToolNameStrikes >= MAX_INVALID_TOOL_NAME_STRIKES) {
      const giveUp = `Model called unknown tools ${MAX_INVALID_TOOL_NAME_STRIKES} times in a row without a valid one. Giving up on this turn.`;
      console.log(chalk.red(giveUp));
      return { content: giveUp, messages };
    }
  }

  const giveUpMessage = `Reached the maximum of ${MAX_TOOL_ITERATIONS} tool calls for this turn without a final answer. Try breaking the request into smaller steps.`;
  console.log(chalk.red(giveUpMessage));
  return { content: giveUpMessage, messages };
}
