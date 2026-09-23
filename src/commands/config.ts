import { resolve } from "node:path";
import chalk from "chalk";
import {
  configFilePath,
  getConfig,
  loadProjectConfigOverrides,
  maskSecret,
  setConfigValue,
  SECRET_KEYS,
  type DevBuddyConfig,
} from "../lib/config.js";
import { repoConfigFile } from "../lib/project.js";

const SETTABLE_KEYS: (keyof DevBuddyConfig)[] = [
  "provider",
  "host",
  "model",
  "systemPrompt",
  "openaiApiKey",
  "openaiBaseUrl",
  "verifyCommand",
];

export function configCommand(args: string[]): void {
  if (args.length === 0) {
    const config = getConfig();
    const projectRoot = resolve(process.cwd());
    const overrides = loadProjectConfigOverrides(projectRoot);
    console.log(chalk.bold(`Config file: ${configFilePath()}\n`));
    for (const key of SETTABLE_KEYS) {
      const isSecret = (SECRET_KEYS as string[]).includes(key);
      const display = (v: string) => (isSecret ? maskSecret(v) : v);
      const overridden = key in overrides;
      console.log(
        `${chalk.cyan(key)}: ${display(config[key])}` +
          (overridden ? chalk.magenta(`  (project overrides to: ${display(String(overrides[key]))})`) : "")
      );
    }
    if (Object.keys(overrides).length > 0) {
      console.log(chalk.dim(`\nProject overrides come from ${repoConfigFile(projectRoot)} - these are what actually run here.`));
    }
    return;
  }

  if (args[0] === "set") {
    const key = args[1] as keyof DevBuddyConfig;
    const value = args.slice(2).join(" ");
    if (!SETTABLE_KEYS.includes(key)) {
      console.error(chalk.red(`Unknown config key "${args[1]}". Valid keys: ${SETTABLE_KEYS.join(", ")}`));
      process.exitCode = 1;
      return;
    }
    if (!value) {
      console.error(chalk.red("Usage: devbuddy config set <key> <value>"));
      process.exitCode = 1;
      return;
    }
    setConfigValue(key, value);
    console.log(chalk.green(`Set ${key} = ${value}`));
    return;
  }

  console.error(chalk.red('Usage: devbuddy config [set <key> <value>]'));
  process.exitCode = 1;
}
