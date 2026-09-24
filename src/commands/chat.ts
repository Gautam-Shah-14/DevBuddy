import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { getEffectiveConfig } from "../lib/config.js";
import { getProvider } from "../providers/index.js";
import { ensureProject, repoSkillsDir } from "../lib/project.js";
import { ProjectMemory, type SessionSummary } from "../lib/memory.js";
import { buildSystemPrompt, runAgentTurn } from "../lib/agent.js";
import { builtinTools } from "../tools/index.js";
import { loadSkills } from "../lib/skills.js";
import { McpManager } from "../lib/mcp.js";
import { setSharedReadline } from "../lib/permissions.js";
import { printBanner } from "../lib/banner.js";
import { GuardrailsEngine } from "../lib/guardrails/engine.js";
import { getPlan } from "../lib/license.js";
import { compactMessages, resolveCompactThreshold, shouldCompact } from "../lib/compact.js";
import type { ChatMessage, ChatProvider } from "../providers/index.js";

/** Non-system messages older than this are always kept out of auto/manual
 *  compaction's summarization pass - recent turns stay verbatim for continuity. */
const KEEP_RECENT_MESSAGES = 8;

/** Brand accent used for the "⏺" turn marker and the input prompt, matching the banner gradient. */
const ACCENT = "#3b82f6";

/** Cycled at random per turn for the "thinking" spinner, the way Claude Code's own CLI does. */
const THINKING_VERBS = ["Thinking", "Pondering", "Reasoning", "Working", "Noodling", "Percolating", "Cooking"];

function randomThinkingVerb(): string {
  return THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
}

/**
 * Summarizes everything but the most recent messages into one summary
 * message, persists it as the session's compaction point, and returns the
 * replacement message list for the live REPL loop to continue with.
 *
 * Deliberately reads the session's current window from the database
 * (getSessionMessagesWithIds) rather than trusting the caller's in-memory
 * `messages` array: by the time a turn completes, everything in it is
 * already persisted, and going through the DB is what makes repeated
 * compactions (each one cutting from wherever the last one left off) safe
 * to reason about - see the id-ordering note on getSessionMessagesWithIds.
 * Returns null if there isn't enough conversation yet to be worth compacting.
 */
export async function compactSession(
  provider: ChatProvider,
  model: string,
  memory: ProjectMemory,
  sessionId: number
): Promise<{ messages: ChatMessage[]; compactedCount: number } | null> {
  const window = memory.getSessionMessagesWithIds(sessionId);
  const result = await compactMessages(provider, model, window, KEEP_RECENT_MESSAGES);
  if (!result) return null;
  const summaryMessageId = memory.addMessage(sessionId, result.summaryMessage);
  memory.setCompactionPoint(sessionId, summaryMessageId, result.keepFromMessageId);
  return { messages: result.messages, compactedCount: result.compactedCount };
}

export interface ChatOptions {
  model?: string;
  /** -c/--continue: resume the most recently used session in this project. */
  continueSession?: boolean;
  /** -r/--resume [id]: a specific session id to resume, or `true` when no id
   *  was given (pick one from a list of recent sessions instead). */
  resume?: string | boolean;
}

/** The most recently used session in this project, or null if there is none yet. */
export function resolveContinueSessionId(sessions: SessionSummary[]): number | null {
  return sessions[0]?.id ?? null;
}

/**
 * Turns a typed answer from the resume picker into a session id: a list
 * position (1-based, matching what was printed) if it's in range, otherwise
 * the number is treated as a literal session id (so typing an id directly
 * also works). An empty or non-numeric answer cancels (returns null).
 */
export function resolveResumePickerAnswer(answer: string, sessions: SessionSummary[]): number | null {
  const trimmed = answer.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  if (n >= 1 && n <= sessions.length) return sessions[n - 1].id;
  return n;
}

function formatSessionLine(index: number | null, s: SessionSummary): string {
  const status = s.endedAt ? new Date(s.endedAt).toLocaleString() : chalk.green("(ongoing)");
  const providerModel = s.provider ? `${s.provider}/${s.model ?? "?"}` : chalk.dim("unknown model");
  const label = index !== null ? chalk.cyan(`${index})`) : chalk.cyan(`#${s.id}`);
  const snippet = (s.firstUserMessage ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${label} ${new Date(s.startedAt).toLocaleString()} → ${status}  ${chalk.dim(`[${providerModel}]`)}\n     ${snippet}`;
}

/** Resolves --continue/--resume into a session id to reopen, prompting
 *  interactively for --resume with no id. Returns null to start fresh. */
async function resolveResumeSessionId(memory: ProjectMemory, options: ChatOptions): Promise<number | null> {
  if (options.continueSession) {
    const id = resolveContinueSessionId(memory.listSessions(1));
    if (id === null) console.log(chalk.yellow("No previous session in this project yet - starting a new one."));
    return id;
  }

  if (options.resume === undefined) return null;

  if (typeof options.resume === "string") {
    const id = Number(options.resume);
    if (!Number.isInteger(id)) {
      console.error(chalk.red(`Invalid session id "${options.resume}".`));
      process.exitCode = 1;
      return null;
    }
    return id;
  }

  const sessions = memory.listSessions(20);
  if (sessions.length === 0) {
    console.log(chalk.yellow("No previous sessions in this project yet - starting a new one."));
    return null;
  }

  console.log(chalk.bold("Recent sessions:\n"));
  sessions.forEach((s, i) => console.log(formatSessionLine(i + 1, s)));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try {
    answer = await rl.question(chalk.cyan("\nResume which session? [number, or blank for a new session]: "));
  } finally {
    rl.close();
  }
  return resolveResumePickerAnswer(answer, sessions);
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  printBanner();

  const projectRoot = resolve(process.cwd());
  const config = getEffectiveConfig(projectRoot);
  const model = options.model ?? config.model;
  const provider = getProvider(config.provider);

  const connected = await provider.checkConnection();
  if (!connected) {
    console.error(
      chalk.red(
        `Could not reach the "${provider.name}" provider. ` +
          (provider.name === "ollama"
            ? `Start Ollama with "ollama serve" and try again.`
            : `Check your provider config (devbuddy provider list) and network connection.`)
      )
    );
    process.exitCode = 1;
    return;
  }

  const availableModels = await provider.listModels().catch((): string[] => []);
  if (availableModels.length > 0 && !availableModels.includes(model)) {
    console.log(
      chalk.yellow(
        `Warning: model "${model}" is not in the "${provider.name}" provider's model list (${availableModels.join(", ")}).`
      )
    );
  }

  const paths = ensureProject(projectRoot);
  const memory = new ProjectMemory(projectRoot);

  const resumeSessionId = await resolveResumeSessionId(memory, options);
  const priorMessages = resumeSessionId !== null ? memory.getSessionMessages(resumeSessionId) : [];
  if (resumeSessionId !== null && priorMessages.length === 0) {
    console.log(chalk.yellow(`No session #${resumeSessionId} found in this project - starting a new one instead.`));
  }

  const skills = loadSkills(paths.skillsDir, repoSkillsDir(projectRoot));

  const mcpManager = new McpManager();
  const mcpTools = await mcpManager.connectAll(projectRoot);
  const tools = [...builtinTools, ...mcpTools];

  const systemMessage: ChatMessage = { role: "system", content: buildSystemPrompt(tools, skills, config.systemPrompt) };
  let sessionId: number;
  let messages: ChatMessage[];
  if (resumeSessionId !== null && priorMessages.length > 0) {
    sessionId = resumeSessionId;
    memory.reopenSession(sessionId, provider.name, model);
    messages = [systemMessage, ...priorMessages.filter((m) => m.role !== "system")];
    const priorTurns = messages.length - 1;
    console.log(chalk.dim(`Resumed session #${sessionId} (${priorTurns} prior message${priorTurns === 1 ? "" : "s"}).`));
  } else {
    sessionId = memory.startSession(provider.name, model);
    messages = [systemMessage];
    memory.addMessage(sessionId, systemMessage);
  }

  // Guardrails (PII/secret masking or blocking before AI calls) are a Pro
  // feature - fall back to "off" for free plans even if a mode was set
  // while a license was active (e.g. after it expired).
  const effectiveGuardrailsMode = getPlan() === "pro" ? config.guardrailsMode : "off";
  const guardrails = new GuardrailsEngine(effectiveGuardrailsMode);
  if (config.guardrailsMode !== "off" && effectiveGuardrailsMode === "off") {
    console.log(chalk.yellow(`Guardrails mode "${config.guardrailsMode}" requires a Pro license - running with guardrails off.`));
  }

  console.log(chalk.dim(`Model: ${model} (via ${provider.name})`));
  console.log(chalk.dim(`Project: ${projectRoot}`));
  if (effectiveGuardrailsMode !== "off") {
    console.log(chalk.dim(`Guardrails: ${effectiveGuardrailsMode}`));
  }
  console.log(chalk.dim(`Type your request, "/compact" to summarize older history, or "exit" to quit.\n`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  setSharedReadline(rl);

  try {
    while (true) {
      let rawInput: string;
      try {
        rawInput = await rl.question(chalk.hex(ACCENT).bold("❯ "));
      } catch {
        // stdin closed (EOF / piped input exhausted) - exit the loop cleanly
        break;
      }
      const input = rawInput.trim();
      if (!input) continue;
      if (["exit", "quit", ":q"].includes(input.toLowerCase())) break;

      if (input === "/compact") {
        const spinner = ora({ text: "compacting conversation history", stream: process.stdout, discardStdin: false }).start();
        try {
          const compacted = await compactSession(provider, model, memory, sessionId);
          spinner.stop();
          if (!compacted) {
            console.log(chalk.yellow("Not enough conversation yet to compact.\n"));
          } else {
            messages = compacted.messages;
            console.log(chalk.dim(`Compacted ${compacted.compactedCount} older message(s) into a summary.\n`));
          }
        } catch (err) {
          spinner.stop();
          console.error(chalk.red(`Compaction failed: ${(err as Error).message}\n`));
        }
        continue;
      }

      const userMessage: ChatMessage = { role: "user", content: input };
      messages.push(userMessage);
      memory.addMessage(sessionId, userMessage);

      let printedAny = false;
      let needsBullet = true; // each run of streamed text is its own "⏺" block, like Claude Code's turn markers
      const printBulletOnce = () => {
        if (!needsBullet) return;
        process.stdout.write(chalk.hex(ACCENT).bold("⏺ "));
        needsBullet = false;
      };
      const spinner = ora({
        text: `${randomThinkingVerb()}… ${chalk.dim("(ctrl+c to cancel)")}`,
        stream: process.stdout,
        discardStdin: false,
      }).start();

      try {
        const turn = await runAgentTurn({
          model,
          provider,
          messages,
          tools,
          skills,
          projectRoot,
          projectPaths: paths,
          memory,
          sessionId,
          guardrails,
          verifyCommand: config.verifyCommand,
          onToken: (token) => {
            if (spinner.isSpinning) spinner.stop();
            printedAny = true;
            printBulletOnce();
            process.stdout.write(token);
          },
          onToolStart: (name, args) => {
            if (spinner.isSpinning) spinner.stop();
            printedAny = true;
            console.log(`\n${chalk.hex(ACCENT).bold("⏺")} ${chalk.bold(name)}(${chalk.dim(JSON.stringify(args))})`);
            needsBullet = true; // any text after this tool call starts a fresh block
          },
          onToolResult: (name, result) => {
            const preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
            console.log(chalk.dim(`  ⎿  ${preview}`));
          },
          onVerify: (event) => {
            if (spinner.isSpinning) spinner.stop();
            if (event.status === "running") {
              console.log(chalk.dim(`  ⎿  Running self-check: \`${event.command}\`...`));
            } else if (event.status === "passed") {
              console.log(chalk.green(`  ⎿  ✓ Self-check passed (${event.command})`));
            } else {
              console.log(chalk.red(`  ⎿  ✗ Self-check failed (${event.command}) - asking DevBuddy to fix it`));
            }
          },
          onRetry: (info) => {
            if (spinner.isSpinning) spinner.stop();
            console.log(
              chalk.dim(
                `  ⎿  ⟳ ${info.reason}, retrying (${info.attempt}/${info.maxAttempts}) in ${Math.round(info.delayMs / 100) / 10}s...`
              )
            );
          },
        });
        if (!printedAny) {
          spinner.stop();
          printBulletOnce();
          process.stdout.write(turn.content);
        }
        messages = turn.messages;
        console.log("\n");

        const threshold = resolveCompactThreshold(config.compactThreshold);
        if (shouldCompact(messages, threshold, KEEP_RECENT_MESSAGES)) {
          const compactSpinner = ora({
            text: "conversation is getting long, compacting...",
            stream: process.stdout,
            discardStdin: false,
          }).start();
          try {
            const compacted = await compactSession(provider, model, memory, sessionId);
            compactSpinner.stop();
            if (compacted) {
              messages = compacted.messages;
              console.log(chalk.dim(`(compacted ${compacted.compactedCount} older message(s) to stay within context)\n`));
            }
          } catch (err) {
            compactSpinner.stop();
            console.error(chalk.yellow(`Auto-compaction failed, continuing with full history: ${(err as Error).message}\n`));
          }
        }
      } catch (err) {
        spinner.stop();
        console.error(chalk.red(`\nError: ${(err as Error).message}\n`));
      }
    }
  } finally {
    setSharedReadline(null);
    rl.close();
    memory.endSession(sessionId);
    memory.close();
    await mcpManager.disconnectAll();
  }

  console.log(chalk.dim("Session saved. Goodbye."));
}
