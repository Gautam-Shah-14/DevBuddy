#!/usr/bin/env node
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) return;
  console.warn(warning);
});

import { createRequire } from "node:module";
import { Command } from "commander";
import { chatCommand } from "./commands/chat.js";
import { configCommand } from "./commands/config.js";
import { modelsCommand } from "./commands/models.js";
import { skillsCommand } from "./commands/skills.js";
import { connectorsCommand } from "./commands/connectors.js";
import { providerCommand } from "./commands/provider.js";
import { licenseCommand } from "./commands/license.js";
import { guardrailsCommand } from "./commands/guardrails.js";
import { statsCommand } from "./commands/stats.js";
import { historyCommand } from "./commands/history.js";
import { doctorCommand } from "./commands/doctor.js";
import { undoCommand } from "./commands/undo.js";
import { runCommand } from "./commands/run.js";
import { projectCommand } from "./commands/project.js";

// Read the real version from package.json (via createRequire, so it works
// identically whether this runs as compiled CJS-resolvable JSON or via tsx)
// instead of a hardcoded string that silently drifts the next time the
// package version is bumped and this file isn't touched.
const require = createRequire(import.meta.url);
const { version: packageVersion } = require("../package.json") as { version: string };

const program = new Command();

// Running "devbuddy" with no subcommand IS the product: it starts an
// interactive agent session, same as typing a command in Claude Code's own
// CLI. -c/-r reopen a past session instead of starting a fresh one. There
// is deliberately no separate "chat" subcommand - one obvious way to start.
program
  .name("devbuddy")
  .description("DevBuddy — a local-first CLI developer agent powered by your own Ollama installation")
  .version(packageVersion)
  .option("-m, --model <model>", "Ollama model to use (overrides config default)")
  .option("-c, --continue", "Continue the most recently used session in this project")
  .option("-r, --resume [sessionId]", "Resume a session by id, or pick from a list of recent sessions")
  .action((options) => chatCommand({ model: options.model, continueSession: !!options.continue, resume: options.resume }));

program
  .command("models")
  .description("List locally installed Ollama models")
  .action(() => modelsCommand());

program
  .command("config [action] [key] [value]")
  .description("View or set DevBuddy configuration (e.g. config set model qwen2.5-coder)")
  .action((action?: string, key?: string, value?: string) => {
    const args = [action, key, value].filter((v): v is string => v !== undefined);
    configCommand(args);
  });

program
  .command("skills [action] [name] [flags...]")
  .description("List or create skills (e.g. skills create my-skill [--project])")
  .allowUnknownOption()
  .action((action?: string, name?: string, flags: string[] = []) => {
    const args = [action, name, ...flags].filter((v): v is string => v !== undefined);
    skillsCommand(args);
  });

program
  .command("connector [action] [name] [flags...]")
  .description("Manage MCP connectors (list/add/remove/enable/disable)")
  .allowUnknownOption()
  .action((action?: string, name?: string, flags: string[] = []) => {
    const args = [action, name, ...flags].filter((v): v is string => v !== undefined);
    connectorsCommand(args);
  });

program
  .command("provider [action] [name] [value]")
  .description("Manage AI providers (list/use/set-key/set-url)")
  .action((action?: string, name?: string, value?: string) => {
    const args = [action, name, value].filter((v): v is string => v !== undefined);
    providerCommand(args);
  });

program
  .command("license [action] [key]")
  .description("Manage your DevBuddy Pro license (set/status/remove)")
  .action((action?: string, key?: string) => {
    const args = [action, key].filter((v): v is string => v !== undefined);
    licenseCommand(args);
  });

program
  .command("guardrails [action] [value]")
  .description("Manage PII/secret guardrails (status/set off|mask|block) - Pro feature")
  .action((action?: string, value?: string) => {
    const args = [action, value].filter((v): v is string => v !== undefined);
    guardrailsCommand(args);
  });

program
  .command("stats")
  .description("Show session/message/token counts for the current project (or --all for every project)")
  .option("--all", "Show stats across every project DevBuddy has been used in")
  .action((options) => statsCommand(options));

program
  .command("history [action] [args...]")
  .description("Browse local session history (list/show <id>/search <text> [--all])")
  .option("--all", "For search: look across every project, not just this one")
  .allowUnknownOption()
  .action((action?: string, args: string[] = [], options?: { all?: boolean }) => {
    const cmdArgs = [action, ...args].filter((v): v is string => v !== undefined);
    historyCommand(cmdArgs, options ?? {});
  });

program
  .command("doctor")
  .description("Check Ollama/API connectivity, Node version, git, disk space, and config in one report")
  .action(() => doctorCommand());

program
  .command("undo [action] [n]")
  .description("Revert the agent's last file change in this project (or: undo list [n])")
  .action((action?: string, n?: string) => {
    const args = [action, n].filter((v): v is string => v !== undefined);
    undoCommand(args);
  });

program
  .command("run <prompt>")
  .description("Run a single non-interactive agent turn (for scripts/CI) and print the result")
  .option("-y, --yes", "Auto-approve risky actions (writes, deletes, shell commands, git push) without prompting")
  .option("-m, --model <model>", "Ollama model to use (overrides config default)")
  .option("--json", 'Print {sessionId, model, provider, content} as JSON instead of streaming plain text')
  .action((prompt: string, options: { yes?: boolean; model?: string; json?: boolean }) => runCommand(prompt, options));

program
  .command("project [action]")
  .description("Set up this project's team-shared .devbuddy/ directory (project init)")
  .action((action?: string) => projectCommand([action].filter((v): v is string => v !== undefined)));

program.parseAsync(process.argv);
