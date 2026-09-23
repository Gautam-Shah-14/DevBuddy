#!/usr/bin/env node
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning" && warning.message.includes("SQLite")) return;
  console.warn(warning);
});

import { Command } from "commander";
import { chatCommand } from "./commands/chat.js";
import { configCommand } from "./commands/config.js";
import { modelsCommand } from "./commands/models.js";

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

program.parseAsync(process.argv);
