import { resolve } from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { ProjectMemory, type SearchHit, type SessionSummary } from "../lib/memory.js";
import { projectPaths, listAllProjects } from "../lib/project.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function snippet(text: string | null, length = 70): string {
  if (!text) return chalk.dim("(no user message)");
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > length ? oneLine.slice(0, length) + "..." : oneLine;
}

function printSessionList(sessions: SessionSummary[]): void {
  if (sessions.length === 0) {
    console.log(chalk.yellow("No sessions found."));
    return;
  }
  for (const s of sessions) {
    const status = s.endedAt ? formatDate(s.endedAt) : chalk.green("(ongoing)");
    const providerModel = s.provider ? `${s.provider}/${s.model ?? "?"}` : chalk.dim("unknown model");
    console.log(
      `${chalk.cyan(`#${s.id}`)} ${formatDate(s.startedAt)} → ${status}  ` +
        `${chalk.dim(`[${providerModel}, ${s.messageCount} msgs]`)}`
    );
    console.log(`   ${snippet(s.firstUserMessage)}`);
  }
}

function printSearchHits(hits: SearchHit[], query: string, projectLabel?: string): void {
  if (hits.length === 0) {
    console.log(chalk.yellow(`No matches for "${query}"${projectLabel ? ` in ${projectLabel}` : ""}.`));
    return;
  }
  for (const hit of hits) {
    const prefix = projectLabel ? chalk.dim(`${projectLabel} `) : "";
    console.log(
      `${prefix}${chalk.cyan(`session #${hit.sessionId}`)} ${chalk.dim(formatDate(hit.createdAt))} ` +
        chalk.dim(`(${hit.role})`)
    );
    const idx = hit.content.toLowerCase().indexOf(query.toLowerCase());
    const start = Math.max(0, idx - 40);
    const excerpt = (start > 0 ? "..." : "") + hit.content.slice(start, idx + query.length + 40).replace(/\s+/g, " ");
    console.log(`   ${excerpt}${hit.content.length > start + excerpt.length ? "..." : ""}`);
  }
}

export async function historyCommand(args: string[], options: { all?: boolean }): Promise<void> {
  const [action, ...rest] = args;
  const projectRoot = resolve(process.cwd());
  const paths = projectPaths(projectRoot);

  if (!action || action === "list") {
    const sessions = ProjectMemory.listSessionsFrom(paths.dbFile, 20);
    console.log(chalk.bold(`Recent sessions in ${projectRoot}:\n`));
    printSessionList(sessions);
    return;
  }

  if (action === "show") {
    const sessionId = Number(rest[0]);
    if (!Number.isInteger(sessionId)) {
      console.error(chalk.red("Usage: devbuddy history show <session-id>"));
      process.exitCode = 1;
      return;
    }
    if (!existsSync(paths.dbFile)) {
      console.log(chalk.yellow("No DevBuddy session data for this project yet."));
      return;
    }
    const transcript = ProjectMemory.getTranscriptFrom(paths.dbFile, sessionId);
    if (transcript.length === 0) {
      console.log(chalk.yellow(`No session #${sessionId} found in this project.`));
      return;
    }
    for (const msg of transcript) {
      if (msg.role === "system") continue; // long and not interesting to replay
      const roleColor = msg.role === "user" ? chalk.green : msg.role === "assistant" ? chalk.cyan : chalk.dim;
      console.log(`${roleColor(msg.role)} ${chalk.dim(formatDate(msg.createdAt))}`);
      console.log(`${msg.content}\n`);
    }
    return;
  }

  if (action === "search") {
    const query = rest.join(" ").trim();
    if (!query) {
      console.error(chalk.red("Usage: devbuddy history search <text> [--all]"));
      process.exitCode = 1;
      return;
    }

    if (options.all) {
      const projects = listAllProjects();
      let total = 0;
      for (const { meta, paths: p } of projects) {
        const hits = ProjectMemory.searchFrom(p.dbFile, query, 20);
        if (hits.length === 0) continue;
        total += hits.length;
        printSearchHits(hits, query, `[${meta.name}]`);
      }
      if (total === 0) console.log(chalk.yellow(`No matches for "${query}" in any project.`));
      return;
    }

    const hits = ProjectMemory.searchFrom(paths.dbFile, query, 50);
    printSearchHits(hits, query);
    return;
  }

  console.error(chalk.red("Usage:\n  devbuddy history [list]\n  devbuddy history show <session-id>\n  devbuddy history search <text> [--all]"));
  process.exitCode = 1;
}
