#!/usr/bin/env node
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) return;
  console.warn(warning);
});

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
import { printBanner } from "./lib/banner.js";

if (process.argv.length <= 2) printBanner();

const program = new Command();

program
  .name("devbuddy")
  .description("DevBuddy — a local-first CLI developer agent powered by your own Ollama installation")
  .version("0.1.0");

program
  .command("chat")
  .description("Start an interactive agent session in the current project")
  .option("-m, --model <model>", "Ollama model to use (overrides config default)")
  .action((options) => chatCommand(options));

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

program.parseAsync(process.argv);
