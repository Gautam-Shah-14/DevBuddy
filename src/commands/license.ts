import chalk from "chalk";
import { setConfigValue, getConfig, maskSecret } from "../lib/config.js";
import { verifyLicenseKey, getPlan } from "../lib/license.js";

function printUsage(): void {
  console.error(chalk.red("Usage:\n  devbuddy license set <key>\n  devbuddy license status\n  devbuddy license remove"));
}

export function licenseCommand(args: string[]): void {
  const [action, key] = args;

  if (!action || action === "status") {
    const config = getConfig();
    const plan = getPlan();
    console.log(chalk.bold(`Plan: ${plan === "pro" ? chalk.green("pro") : "free"}`));
    if (config.licenseKey) {
      console.log(chalk.dim(`License key: ${maskSecret(config.licenseKey)}`));
      const result = verifyLicenseKey(config.licenseKey);
      if (result.valid) {
        if (result.payload.exp) {
          console.log(chalk.dim(`Expires: ${new Date(result.payload.exp * 1000).toISOString()}`));
        }
      } else {
        console.log(chalk.red(`License key is invalid: ${result.reason}`));
      }
    }
    return;
  }

  if (action === "set") {
    if (!key) return printUsage();
    const result = verifyLicenseKey(key);
    if (!result.valid) {
      console.error(chalk.red(`Could not set license key: ${result.reason}`));
      process.exitCode = 1;
      return;
    }
    setConfigValue("licenseKey", key);
    console.log(chalk.green(`License key accepted. Plan is now "${result.payload.plan}".`));
    return;
  }

  if (action === "remove") {
    setConfigValue("licenseKey", "");
    console.log(chalk.green("License key removed. Plan is now \"free\"."));
    return;
  }

  printUsage();
  process.exitCode = 1;
}
