import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requestPermission } from "../lib/permissions.js";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);

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
    await requestPermission({ category: "shell", description: `Run: ${command}` });
    try {
      const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", command], {
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
