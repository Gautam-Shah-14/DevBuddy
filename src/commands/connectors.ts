import { resolve } from "node:path";
import chalk from "chalk";
import { addConnector, loadConnectors, removeConnector, setConnectorEnabled } from "../lib/connectors.js";

function printUsage(): void {
  console.error(
    chalk.red(
      "Usage:\n" +
        "  devbuddy connector list\n" +
        '  devbuddy connector add <name> --command "<cmd>" [--args "a b c"] [--env KEY=VALUE ...] [--shared]\n' +
        "  devbuddy connector remove <name>\n" +
        "  devbuddy connector enable <name>\n" +
        "  devbuddy connector disable <name>\n\n" +
        "--shared writes to the project's committed .devbuddy/connectors.json (see devbuddy project init)\n" +
        "instead of your own ~/.devbuddy - the whole team gets it, so never put a literal secret in --env;\n" +
        "reference an environment variable the command itself expands instead."
    )
  );
}

function parseFlags(args: string[]): { command?: string; args: string[]; env: Record<string, string>; shared: boolean } {
  let command: string | undefined;
  const cmdArgs: string[] = [];
  const env: Record<string, string> = {};
  let shared = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--command") command = args[++i];
    else if (args[i] === "--args") cmdArgs.push(...(args[++i] ?? "").split(" ").filter(Boolean));
    else if (args[i] === "--shared") shared = true;
    else if (args[i] === "--env") {
      const [key, ...rest] = (args[++i] ?? "").split("=");
      if (key) env[key] = rest.join("=");
    }
  }
  return { command, args: cmdArgs, env, shared };
}

export function connectorsCommand(args: string[]): void {
  const [action, name, ...rest] = args;
  const projectRoot = resolve(process.cwd());

  if (!action || action === "list") {
    const connectors = loadConnectors(projectRoot);
    if (connectors.length === 0) {
      console.log(chalk.yellow("No MCP connectors configured."));
      console.log(
        `Add one with: ${chalk.cyan('devbuddy connector add filesystem --command "npx" --args "-y @modelcontextprotocol/server-filesystem /path"')}`
      );
      return;
    }
    console.log(chalk.bold("MCP connectors:\n"));
    for (const c of connectors) {
      const scope = c.shared ? chalk.magenta("(shared)") : chalk.dim("(local)");
      console.log(
        `  ${chalk.cyan(c.name)} ${c.enabled ? chalk.green("(enabled)") : chalk.dim("(disabled)")} ${scope} — ${c.command} ${c.args.join(" ")}`
      );
    }
    return;
  }

  if (action === "add") {
    if (!name) return printUsage();
    const { command, args: cmdArgs, env, shared } = parseFlags(rest);
    if (!command) return printUsage();
    addConnector({ name, command, args: cmdArgs, env, enabled: true }, shared ? projectRoot : undefined);
    console.log(
      chalk.green(`Added connector "${name}"${shared ? " to the project's shared .devbuddy/connectors.json" : ""}`)
    );
    return;
  }

  if (action === "remove") {
    if (!name || (!removeConnector(name) && !removeConnector(name, projectRoot))) {
      console.error(chalk.red(`No connector named "${name}"`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`Removed connector "${name}"`));
    return;
  }

  if (action === "enable" || action === "disable") {
    const enabled = action === "enable";
    if (!name || (!setConnectorEnabled(name, enabled) && !setConnectorEnabled(name, enabled, projectRoot))) {
      console.error(chalk.red(`No connector named "${name}"`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.green(`${enabled ? "Enabled" : "Disabled"} connector "${name}"`));
    return;
  }

  printUsage();
  process.exitCode = 1;
}
