import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import chalk from "chalk";
import { ProjectMemory, type Checkpoint } from "../lib/memory.js";
import { resolveInSandbox } from "../lib/sandbox.js";

function formatCheckpoint(c: Checkpoint): string {
  const action = c.existedBefore ? c.toolName : "write_file (new file)";
  const when = new Date(c.createdAt).toLocaleString();
  const status = c.reverted ? chalk.dim(" (already reverted)") : "";
  return `${chalk.cyan(`#${c.id}`)} ${when}  ${chalk.dim(action)}  ${c.filePath}${status}`;
}

function revert(projectRoot: string, checkpoint: Checkpoint): void {
  const path = resolveInSandbox(projectRoot, checkpoint.filePath);
  if (checkpoint.existedBefore) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, checkpoint.contentBefore ?? "");
  } else if (existsSync(path)) {
    rmSync(path);
  }
}

export async function undoCommand(args: string[]): Promise<void> {
  const [action, ...rest] = args;
  const projectRoot = resolve(process.cwd());
  const memory = new ProjectMemory(projectRoot);

  try {
    if (action === "list") {
      const limit = Number(rest[0]) || 20;
      const checkpoints = memory.listCheckpoints(limit);
      if (checkpoints.length === 0) {
        console.log(chalk.yellow("No file changes recorded for this project yet."));
        return;
      }
      console.log(chalk.bold(`Recent file changes in ${projectRoot}:\n`));
      for (const c of checkpoints) console.log(formatCheckpoint(c));
      return;
    }

    if (action) {
      console.error(chalk.red("Usage:\n  devbuddy undo\n  devbuddy undo list [n]"));
      process.exitCode = 1;
      return;
    }

    const checkpoint = memory.getLatestCheckpoint();
    if (!checkpoint) {
      console.log(chalk.yellow("Nothing to undo — no recorded file changes for this project."));
      return;
    }

    revert(projectRoot, checkpoint);
    memory.markCheckpointReverted(checkpoint.id);

    if (checkpoint.existedBefore) {
      console.log(chalk.green(`Reverted ${checkpoint.toolName} on ${checkpoint.filePath} to its previous content.`));
    } else {
      console.log(chalk.green(`Undid ${checkpoint.toolName}: deleted ${checkpoint.filePath} (it didn't exist before that change).`));
    }
    console.log(chalk.dim("Run \"devbuddy undo\" again to go further back."));
  } finally {
    memory.close();
  }
}
