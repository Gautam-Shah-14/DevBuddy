import { exec } from "node:child_process";
import { promisify } from "node:util";
import { requestPermission } from "../lib/permissions.js";
import { detectHardlineCommand } from "../lib/dangerousCommands.js";
import type { ToolDefinition } from "./types.js";

const execAsync = promisify(exec);

export const runShellTool: ToolDefinition = {
  name: "run_shell",
  description:
    "Run a shell command inside the project directory and return its stdout/stderr. Requires user approval.",
  parameters: {
    type: "object",
    properties: { command: { type: "string", description: "The shell command to execute" } },
    required: ["command"],
  },
  async execute(args, ctx) {
    const command = String(args.command);

    // A small, fixed set of universally catastrophic operations never runs
    // at all - not with approval, not with "remember", not with --yes. This
    // sits UNDER the normal permission prompt below, not instead of it.
    const hardlineMatch = detectHardlineCommand(command);
    if (hardlineMatch) {
      return (
        `Error: refusing to run this command - it looks like it would ${hardlineMatch}. ` +
        `This is blocked unconditionally and cannot be approved, including with --yes.`
      );
    }

    await requestPermission({ category: "shell", description: `Run: ${command}` });
    try {
      // node:child_process picks the OS's default shell automatically
      // (/bin/sh on POSIX, cmd.exe on Windows) - do not hardcode a shell
      // path, it doesn't exist on Windows. Command syntax that only works
      // in bash (e.g. "&&" chains needing bash-specific quoting) may still
      // behave differently under cmd.exe.
      const { stdout, stderr } = await execAsync(command, {
        cwd: ctx.projectRoot,
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });
      return [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message: string };
      return `Command failed: ${e.message}\n${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim();
    }
  },
};
