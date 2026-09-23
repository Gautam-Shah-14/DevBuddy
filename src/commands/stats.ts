import { resolve } from "node:path";
import chalk from "chalk";
import { ProjectMemory, type ProjectStats } from "../lib/memory.js";
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

    console.log(chalk.bold(`Stats across ${projects.length} project(s):\n`));
    for (const { meta, paths } of projects) {
      const stats = ProjectMemory.readStats(paths.dbFile);
      if (!stats) continue;
      printStats(meta.name + chalk.dim(`  (${meta.path})`), stats);
      console.log();
      grand.sessionCount += stats.sessionCount;
      grand.messageCount += stats.messageCount;
      grand.exactPromptTokens += stats.exactPromptTokens;
      grand.exactCompletionTokens += stats.exactCompletionTokens;
      grand.messagesWithoutUsage += stats.messagesWithoutUsage;
      grand.estimatedTokensForMissing += stats.estimatedTokensForMissing;
    }
    printStats("TOTAL (all projects)", grand);
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
}
