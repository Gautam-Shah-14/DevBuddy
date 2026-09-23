import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "../lib/config.js";
import { getProvider } from "../providers/index.js";
import { ensureProject } from "../lib/project.js";
import { ProjectMemory } from "../lib/memory.js";
import { buildSystemPrompt, runAgentTurn } from "../lib/agent.js";
import { builtinTools } from "../tools/index.js";
import { loadSkills } from "../lib/skills.js";
import { McpManager } from "../lib/mcp.js";
import { setSharedReadline } from "../lib/permissions.js";
import { printBanner } from "../lib/banner.js";
import type { ChatMessage } from "../providers/index.js";

export async function chatCommand(options: { model?: string }): Promise<void> {
  printBanner();

  const config = getConfig();
  const model = options.model ?? config.model;
  const projectRoot = resolve(process.cwd());
  const provider = getProvider();

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
  const sessionId = memory.startSession();
  const skills = loadSkills(paths.skillsDir);

  const mcpManager = new McpManager();
  const mcpTools = await mcpManager.connectAll();
  const tools = [...builtinTools, ...mcpTools];

  let messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(tools, skills) }];
  memory.addMessage(sessionId, messages[0]);

  console.log(chalk.dim(`Model: ${model} (via ${provider.name})`));
  console.log(chalk.dim(`Project: ${projectRoot}`));
  console.log(chalk.dim(`Type your request, or "exit" to quit.\n`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  setSharedReadline(rl);

  try {
    while (true) {
      let rawInput: string;
      try {
        rawInput = await rl.question(chalk.green("you> "));
      } catch {
        // stdin closed (EOF / piped input exhausted) - exit the loop cleanly
        break;
      }
      const input = rawInput.trim();
      if (!input) continue;
      if (["exit", "quit", ":q"].includes(input.toLowerCase())) break;

      const userMessage: ChatMessage = { role: "user", content: input };
      messages.push(userMessage);
      memory.addMessage(sessionId, userMessage);

      process.stdout.write(chalk.cyan("devbuddy> "));
      let printedAny = false;
      const spinner = ora({ text: "thinking", stream: process.stdout }).start();

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
          onToken: (token) => {
            if (spinner.isSpinning) spinner.stop();
            printedAny = true;
            process.stdout.write(token);
          },
          onToolStart: (name, args) => {
            if (spinner.isSpinning) spinner.stop();
            console.log(chalk.dim(`\n  → ${name}(${JSON.stringify(args)})`));
          },
          onToolResult: (name, result) => {
            const preview = result.length > 300 ? result.slice(0, 300) + "..." : result;
            console.log(chalk.dim(`  ← ${name}: ${preview}`));
          },
        });
        if (!printedAny) {
          spinner.stop();
          process.stdout.write(turn.content);
        }
        messages = turn.messages;
        console.log("\n");
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
