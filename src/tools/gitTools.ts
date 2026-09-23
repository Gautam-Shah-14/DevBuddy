import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requestPermission } from "../lib/permissions.js";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, { cwd, maxBuffer: 5 * 1024 * 1024 });
    return [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    return `git ${args.join(" ")} failed: ${e.message}\n${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim();
  }
}

export const gitStatusTool: ToolDefinition = {
  name: "git_status",
  description: "Show the current git status of the project.",
  parameters: { type: "object", properties: {} },
  async execute(_args, ctx) {
    return git(ctx.projectRoot, ["status", "--short", "--branch"]);
  },
};

export const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  description: "Show the current git diff (unstaged by default, or staged if requested).",
  parameters: {
    type: "object",
    properties: { staged: { type: "boolean", description: "Show staged diff instead of unstaged" } },
  },
  async execute(args, ctx) {
    const gitArgs = ["diff"];
    if (args.staged) gitArgs.push("--staged");
    return git(ctx.projectRoot, gitArgs);
  },
};

export const gitCommitTool: ToolDefinition = {
  name: "git_commit",
  description: "Stage all changes and create a git commit with the given message. Requires user approval.",
  parameters: {
    type: "object",
    properties: { message: { type: "string", description: "Commit message" } },
    required: ["message"],
  },
  async execute(args, ctx) {
    const message = String(args.message);
    await requestPermission({ category: "write", description: `git commit: "${message}"` });
    await git(ctx.projectRoot, ["add", "-A"]);
    return git(ctx.projectRoot, ["commit", "-m", message]);
  },
};

export const gitPushTool: ToolDefinition = {
  name: "git_push",
  description: "Push the current branch to its remote. Always requires explicit user approval.",
  parameters: {
    type: "object",
    properties: { remote: { type: "string" }, branch: { type: "string" } },
  },
  async execute(args, ctx) {
    const remote = args.remote ? String(args.remote) : "origin";
    const branchArgs = args.branch ? [String(args.branch)] : [];
    await requestPermission({
      category: "git_push",
      description: `git push ${remote} ${branchArgs.join(" ")}`.trim(),
    });
    return git(ctx.projectRoot, ["push", remote, ...branchArgs]);
  },
};
