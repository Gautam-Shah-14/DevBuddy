import chalk from "chalk";
import { configFilePath, getConfig, maskSecret, setConfigValue, SECRET_KEYS, type DevBuddyConfig } from "../lib/config.js";

const SETTABLE_KEYS: (keyof DevBuddyConfig)[] = [
  "provider",
  "host",
  "model",
  "systemPrompt",
  "openaiApiKey",
  "openaiBaseUrl",
];

export function configCommand(args: string[]): void {
  if (args.length === 0) {
    const config = getConfig();
    console.log(chalk.bold(`Config file: ${configFilePath()}\n`));
    for (const key of SETTABLE_KEYS) {
      const isSecret = (SECRET_KEYS as string[]).includes(key);
      console.log(`${chalk.cyan(key)}: ${isSecret ? maskSecret(config[key]) : config[key]}`);
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
