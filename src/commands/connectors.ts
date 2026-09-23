import chalk from "chalk";
import { addConnector, loadConnectors, removeConnector, setConnectorEnabled } from "../lib/connectors.js";

function printUsage(): void {
  console.error(
    chalk.red(
      "Usage:\n" +
        "  devbuddy connector list\n" +
        '  devbuddy connector add <name> --command "<cmd>" [--args "a b c"] [--env KEY=VALUE ...]\n' +
        "  devbuddy connector remove <name>\n" +
        "  devbuddy connector enable <name>\n" +
        "  devbuddy connector disable <name>"
    )
  );
}

function parseFlags(args: string[]): { command?: string; args: string[]; env: Record<string, string> } {
  let command: string | undefined;
  const cmdArgs: string[] = [];
  const env: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--command") command = args[++i];
    else if (args[i] === "--args") cmdArgs.push(...(args[++i] ?? "").split(" ").filter(Boolean));
    else if (args[i] === "--env") {
      const [key, ...rest] = (args[++i] ?? "").split("=");
      if (key) env[key] = rest.join("=");
    }
  }
  return { command, args: cmdArgs, env };
}

export function connectorsCommand(args: string[]): void {
  const [action, name, ...rest] = args;

  if (!action || action === "list") {
    const connectors = loadConnectors();
    if (connectors.length === 0) {
      console.log(chalk.yellow("No MCP connectors configured."));
      console.log(
        `Add one with: ${chalk.cyan('devbuddy connector add filesystem --command "npx" --args "-y @modelcontextprotocol/server-filesystem /path"')}`
      );
      return;
    }
    console.log(chalk.bold("MCP connectors:\n"));
    for (const c of connectors) {
      console.log(
        `  ${chalk.cyan(c.name)} ${c.enabled ? chalk.green("(enabled)") : chalk.dim("(disabled)")} — ${c.command} ${c.args.join(" ")}`
      );
    }
    return;
  }

  if (action === "add") {
    if (!name) return printUsage();
    const { command, args: cmdArgs, env } = parseFlags(rest);
    if (!command) return printUsage();
    addConnector({ name, command, args: cmdArgs, env, enabled: true });
    console.log(chalk.green(`Added connector "${name}"`));
    return;
  }

  if (action === "remove") {
    if (!name || !removeConnector(name)) {
      console.error(chalk.red(`No connector named "${name}"`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`Removed connector "${name}"`));
    return;
  }

  if (action === "enable" || action === "disable") {
    if (!name || !setConnectorEnabled(name, action === "enable")) {
      console.error(chalk.red(`No connector named "${name}"`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`${action === "enable" ? "Enabled" : "Disabled"} connector "${name}"`));
    return;
  }

  printUsage();
  process.exitCode = 1;
}
