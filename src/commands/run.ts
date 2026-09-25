import { resolve } from "node:path";
import chalk from "chalk";
import { getEffectiveConfig } from "../lib/config.js";
import { getProvider } from "../providers/index.js";
import { ensureProject, repoSkillsDir } from "../lib/project.js";
import { ProjectMemory } from "../lib/memory.js";
import { buildSystemPrompt, runAgentTurn } from "../lib/agent.js";
import { builtinTools } from "../tools/index.js";
import { loadSkills } from "../lib/skills.js";
import { McpManager } from "../lib/mcp.js";
import { setAutoApprove } from "../lib/permissions.js";
import { GuardrailsEngine } from "../lib/guardrails/engine.js";
import { getPlan } from "../lib/license.js";
import { renderProjectNotes } from "../lib/notes.js";
import type { ChatMessage } from "../providers/index.js";

export interface RunOptions {
  model?: string;
  yes?: boolean;
  json?: boolean;
  /** Test-only override for the project directory; cli.ts never sets this and always uses the real cwd. */
  projectRootOverride?: string;
}

/**
 * A single non-interactive agent turn: run a prompt to completion and exit,
 * for CI, pre-commit hooks, or one-shot scripting - no REPL, no readline.
 * Diagnostics (tool calls, self-check status) go to stderr so stdout stays
 * clean for the actual answer, whether streamed as text or emitted as JSON.
 */
export async function runCommand(prompt: string, options: RunOptions): Promise<void> {
  if (!prompt || !prompt.trim()) {
    console.error(chalk.red('Usage: devbuddy run "<prompt>" [--yes] [--model <model>] [--json]'));
    process.exitCode = 1;
    return;
  }

  if (options.yes) setAutoApprove(true);

  const projectRoot = resolve(options.projectRootOverride ?? process.cwd());
  const config = getEffectiveConfig(projectRoot);
  const model = options.model ?? config.model;
  const provider = getProvider(config.provider);

  const connected = await provider.checkConnection();
  if (!connected) {
    console.error(chalk.red(`Could not reach the "${provider.name}" provider. Run "devbuddy doctor" to diagnose.`));
    process.exitCode = 1;
    return;
  }

  const paths = ensureProject(projectRoot);
  const memory = new ProjectMemory(projectRoot);
  const sessionId = memory.startSession(provider.name, model);
  const skills = loadSkills(paths.skillsDir, repoSkillsDir(projectRoot));

  const mcpManager = new McpManager();
  const mcpTools = await mcpManager.connectAll(projectRoot);
  const tools = [...builtinTools, ...mcpTools];

  const systemMessage: ChatMessage = {
    role: "system",
    content: buildSystemPrompt(tools, skills, config.systemPrompt, renderProjectNotes(paths.notesFile)),
  };
  const userMessage: ChatMessage = { role: "user", content: prompt };
  const messages: ChatMessage[] = [systemMessage, userMessage];
  memory.addMessage(sessionId, systemMessage);
  memory.addMessage(sessionId, userMessage);

  const effectiveGuardrailsMode = getPlan() === "pro" ? config.guardrailsMode : "off";
  const guardrails = new GuardrailsEngine(effectiveGuardrailsMode);

  let streamedAny = false;

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
        if (options.json) return; // JSON mode prints the final content once, not the stream
        streamedAny = true;
        process.stdout.write(token);
      },
      onToolStart: (name, args) => {
        console.error(chalk.dim(`→ ${name}(${JSON.stringify(args)})`));
      },
      onToolResult: (name, result) => {
        const preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
        console.error(chalk.dim(`← ${name}: ${preview}`));
      },
      onVerify: (event) => {
        if (event.status === "running") console.error(chalk.dim(`Self-check: running \`${event.command}\`...`));
        else if (event.status === "passed") console.error(chalk.green(`Self-check passed (${event.command})`));
        else console.error(chalk.red(`Self-check failed (${event.command})`));
      },
      onRetry: (info) => {
        console.error(
          chalk.dim(`${info.reason}, retrying (${info.attempt}/${info.maxAttempts}) in ${Math.round(info.delayMs / 100) / 10}s...`)
        );
      },
    });

    if (options.json) {
      console.log(JSON.stringify({ sessionId, model, provider: provider.name, content: turn.content }, null, 2));
    } else if (streamedAny) {
      console.log();
    } else {
      console.log(turn.content);
    }
  } catch (err) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exitCode = 1;
  } finally {
    memory.endSession(sessionId);
    memory.close();
    await mcpManager.disconnectAll();
  }
}
