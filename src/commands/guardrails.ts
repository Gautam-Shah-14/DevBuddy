import chalk from "chalk";
import { getConfig, setConfigValue, type GuardrailsMode } from "../lib/config.js";
import { getPlan } from "../lib/license.js";
import { PII_PATTERNS } from "../lib/guardrails/patterns.js";

const VALID_MODES: GuardrailsMode[] = ["off", "mask", "block"];

function printUsage(): void {
  console.error(chalk.red("Usage:\n  devbuddy guardrails status\n  devbuddy guardrails set <off|mask|block>"));
}

export function guardrailsCommand(args: string[]): void {
  const [action, value] = args;

  if (!action || action === "status") {
    const config = getConfig();
    const plan = getPlan();
    console.log(chalk.bold(`Guardrails mode: ${config.guardrailsMode}`));
    console.log(chalk.dim(`Plan: ${plan}${plan === "free" ? " (mask/block require a Pro license - see devbuddy license)" : ""}`));
    console.log(chalk.dim(`Detectors: ${PII_PATTERNS.map((p) => p.type).join(", ")}`));
    return;
  }

  if (action === "set") {
    const mode = value as GuardrailsMode;
    if (!VALID_MODES.includes(mode)) {
      console.error(chalk.red(`Invalid mode "${value}". Valid: ${VALID_MODES.join(", ")}`));
      process.exitCode = 1;
      return;
    }
    if (mode !== "off" && getPlan() !== "pro") {
      console.error(
        chalk.red(
          `Guardrails "${mode}" mode requires a Pro license. Set one with: devbuddy license set <key>`
        )
      );
      process.exitCode = 1;
      return;
    }
    setConfigValue("guardrailsMode", mode);
    console.log(chalk.green(`Guardrails mode set to "${mode}".`));
    return;
  }

  printUsage();
  process.exitCode = 1;
}
