import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description: "Search file contents in the project using a regex pattern (like grep -rn).",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      glob: { type: "string", description: "Optional glob to filter files, e.g. '*.ts'" },
    },
    required: ["pattern"],
  },
  async execute(args, ctx) {
    const rgArgs = ["-n", "-e", String(args.pattern)];
    if (args.glob) rgArgs.push("--glob", String(args.glob));
    rgArgs.push(".");
    try {
      const { stdout } = await execFileAsync("rg", rgArgs, {
        cwd: ctx.projectRoot,
        maxBuffer: 5 * 1024 * 1024,
      });
      return stdout.trim() || "(no matches)";
    } catch (err) {
      const e = err as { code?: number; stdout?: string; message: string };
      if (e.code === 1) return "(no matches)";
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // ripgrep not installed on this machine - fall back to grep
        try {
          const grepArgs = ["-rn", "-E", String(args.pattern), "."];
          const { stdout } = await execFileAsync("grep", grepArgs, {
            cwd: ctx.projectRoot,
            maxBuffer: 5 * 1024 * 1024,
          });
          return stdout.trim() || "(no matches)";
        } catch (grepErr) {
          const ge = grepErr as { code?: number; message: string };
          if (ge.code === 1) return "(no matches)";
          return `search failed: ${ge.message}`;
        }
      }
      return `search failed: ${e.message}`;
    }
  },
};

export const listFilesTool: ToolDefinition = {
  name: "list_files",
  description: "List files in the project, optionally under a subdirectory, respecting .gitignore.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Subdirectory relative to project root, default '.'" } },
  },
  async execute(args, ctx) {
    const target = args.path ? String(args.path) : ".";
    try {
      const { stdout } = await execFileAsync("git", ["ls-files", target], {
        cwd: ctx.projectRoot,
        maxBuffer: 5 * 1024 * 1024,
      });
      return stdout.trim() || "(no files)";
    } catch (err) {
      return `list failed: ${(err as Error).message}`;
    }
  },
};
