import { resolve } from "node:path";
import chalk from "chalk";
import { ProjectMemory, type ProjectStats, type ToolStats, type UsageEntry } from "../lib/memory.js";
import { projectPaths, listAllProjects } from "../lib/project.js";

function printStats(label: string, stats: ProjectStats): void {
  const totalExact = stats.exactPromptTokens + stats.exactCompletionTokens;
  console.log(chalk.bold(label));
  console.log(`  Sessions: ${stats.sessionCount}`);
  console.log(`  Messages: ${stats.messageCount}`);
  console.log(`  Tokens (exact, provider-reported): ${totalExact.toLocaleString()}`);
  console.log(`    prompt: ${stats.exactPromptTokens.toLocaleString()}, completion: ${stats.exactCompletionTokens.toLocaleString()}`);
  if (stats.messagesWithoutUsage > 0) {
    console.log(
      chalk.dim(
        `  + ~${stats.estimatedTokensForMissing.toLocaleString()} estimated tokens ` +
          `(${stats.messagesWithoutUsage} message${stats.messagesWithoutUsage === 1 ? "" : "s"} with no provider-reported usage)`
      )
    );
  }
}

function printToolStats(tools: ToolStats): void {
  if (tools.total === 0) return;
  console.log(`  Tool calls: ${tools.total} (${chalk.green(`${tools.passed} passed`)}, ${chalk.red(`${tools.failed} failed`)})`);
  for (const t of tools.byTool.slice(0, 8)) {
    const failNote = t.failed > 0 ? chalk.red(` (${t.failed} failed)`) : "";
    console.log(chalk.dim(`    ${t.toolName}: ${t.total}${failNote}`));
  }
}

function printUsage(label: string, entries: UsageEntry[]): void {
  if (entries.length === 0) return;
  console.log(`  ${label}:`);
  for (const e of entries) {
    console.log(chalk.dim(`    ${e.name}: ${e.count}x, last used ${new Date(e.lastUsedAt).toLocaleString()}`));
  }
}

export async function statsCommand(options: { all?: boolean }): Promise<void> {
  if (options.all) {
    const projects = listAllProjects();
    if (projects.length === 0) {
      console.log(chalk.yellow("No DevBuddy projects yet - run \"devbuddy chat\" somewhere first."));
      return;
    }

    let grand: ProjectStats = {
      sessionCount: 0,
      messageCount: 0,
      exactPromptTokens: 0,
      exactCompletionTokens: 0,
      messagesWithoutUsage: 0,
      estimatedTokensForMissing: 0,
    };
    let grandTools = { total: 0, passed: 0, failed: 0 };

    console.log(chalk.bold(`Stats across ${projects.length} project(s):\n`));
    for (const { meta, paths } of projects) {
      const stats = ProjectMemory.readStats(paths.dbFile);
      if (!stats) continue;
      printStats(meta.name + chalk.dim(`  (${meta.path})`), stats);
      const tools = ProjectMemory.toolStatsFrom(paths.dbFile);
      if (tools) printToolStats(tools);
      console.log();
      grand.sessionCount += stats.sessionCount;
      grand.messageCount += stats.messageCount;
      grand.exactPromptTokens += stats.exactPromptTokens;
      grand.exactCompletionTokens += stats.exactCompletionTokens;
      grand.messagesWithoutUsage += stats.messagesWithoutUsage;
      grand.estimatedTokensForMissing += stats.estimatedTokensForMissing;
      if (tools) {
        grandTools.total += tools.total;
        grandTools.passed += tools.passed;
        grandTools.failed += tools.failed;
      }
    }
    printStats("TOTAL (all projects)", grand);
    if (grandTools.total > 0) {
      console.log(
        `  Tool calls: ${grandTools.total} (${chalk.green(`${grandTools.passed} passed`)}, ${chalk.red(`${grandTools.failed} failed`)})`
      );
    }
    return;
  }

  const projectRoot = resolve(process.cwd());
  const paths = projectPaths(projectRoot);
  const stats = ProjectMemory.readStats(paths.dbFile);
  if (!stats) {
    console.log(chalk.yellow(`No DevBuddy session data for ${projectRoot} yet - run "devbuddy chat" here first.`));
    return;
  }
  printStats(`Stats for ${projectRoot}`, stats);
  const tools = ProjectMemory.toolStatsFrom(paths.dbFile);
  if (tools) printToolStats(tools);
  printUsage("Skills used", ProjectMemory.skillUsageFrom(paths.dbFile));
  printUsage("Connectors used", ProjectMemory.connectorUsageFrom(paths.dbFile));
}
