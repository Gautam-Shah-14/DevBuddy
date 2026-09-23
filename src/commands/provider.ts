import chalk from "chalk";
import { getConfig, maskSecret, setConfigValue, type ProviderName } from "../lib/config.js";

const KNOWN_PROVIDERS: ProviderName[] = ["ollama", "openai", "anthropic"];
const KEYED_PROVIDERS: ProviderName[] = ["openai", "anthropic"];

function printUsage(): void {
  console.error(
    chalk.red(
      "Usage:\n" +
        "  devbuddy provider list\n" +
        "  devbuddy provider use <ollama|openai|anthropic>\n" +
        "  devbuddy provider set-key <openai|anthropic> <api-key>\n" +
        "  devbuddy provider set-url <openai|anthropic> <base-url>"
    )
  );
}

export function providerCommand(args: string[]): void {
  const [action, ...rest] = args;
  const config = getConfig();

  if (!action || action === "list") {
    console.log(chalk.bold("Providers:\n"));
    for (const name of KNOWN_PROVIDERS) {
      const active = name === config.provider ? chalk.green(" (active)") : "";
      if (name === "ollama") {
        console.log(`  ${chalk.cyan("ollama")}${active} — local, no API key needed. Host: ${config.host}`);
      } else if (name === "openai") {
        console.log(
          `  ${chalk.cyan("openai")}${active} — ${config.openaiBaseUrl}, key: ${maskSecret(config.openaiApiKey)}`
        );
      } else if (name === "anthropic") {
        console.log(
          `  ${chalk.cyan("anthropic")}${active} — ${config.anthropicBaseUrl}, key: ${maskSecret(config.anthropicApiKey)}`
        );
      }
    }
    return;
  }

  if (action === "use") {
    const name = rest[0] as ProviderName | undefined;
    if (!name || !KNOWN_PROVIDERS.includes(name)) {
      console.error(chalk.red(`Unknown provider. Valid: ${KNOWN_PROVIDERS.join(", ")}`));
      process.exitCode = 1;
      return;
    }
    setConfigValue("provider", name);
    console.log(chalk.green(`Switched active provider to "${name}"`));
    return;
  }

  if (action === "set-key") {
    const [name, key] = rest;
    if (!KEYED_PROVIDERS.includes(name as ProviderName) || !key) return printUsage();
    setConfigValue(name === "openai" ? "openaiApiKey" : "anthropicApiKey", key);
    console.log(chalk.green(`Set API key for "${name}"`));
    return;
  }

  if (action === "set-url") {
    const [name, url] = rest;
    if (!KEYED_PROVIDERS.includes(name as ProviderName) || !url) return printUsage();
    setConfigValue(name === "openai" ? "openaiBaseUrl" : "anthropicBaseUrl", url);
    console.log(chalk.green(`Set base URL for "${name}" to ${url}`));
    return;
  }

  printUsage();
  process.exitCode = 1;
}
