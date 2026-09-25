import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, sep } from "node:path";
import type { ToolDefinition } from "./types.js";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".devbuddy", "coverage"]);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // skip files over 2MB - likely binary or generated

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
}

/**
 * Pure-Node fallback used when neither ripgrep nor grep are available
 * (e.g. a stock Windows machine with no WSL/Git Bash). Slower than rg but
 * needs no external tool, so search always works everywhere.
 */
function searchWithNodeFallback(root: string, pattern: string, glob?: string): string {
  const regex = new RegExp(pattern);
  const globRegex = glob ? globToRegExp(glob) : null;
  const files: string[] = [];
  walk(root, files);

  const results: string[] = [];
  for (const file of files) {
    if (globRegex && !globRegex.test(basename(file))) continue;
    try {
      if (statSync(file).size > MAX_FILE_SIZE) continue;
      const content = readFileSync(file, "utf-8");
      const rel = relative(root, file);
      content.split("\n").forEach((line, i) => {
        if (regex.test(line)) results.push(`${rel}:${i + 1}:${line}`);
      });
    } catch {
      continue; // unreadable or binary file - skip
    }
  }
  return results.join("\n").trim() || "(no matches)";
}

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
    const pattern = String(args.pattern);
    const glob = args.glob ? String(args.glob) : undefined;

    const rgArgs = ["-n", "-e", pattern];
    if (glob) rgArgs.push("--glob", glob);
    rgArgs.push(".");
    try {
      const { stdout } = await execFileAsync("rg", rgArgs, {
        cwd: ctx.projectRoot,
        maxBuffer: 5 * 1024 * 1024,
      });
      return stdout.trim() || "(no matches)";
    } catch (err) {
      const e = err as { code?: number; message: string };
      if (e.code === 1) return "(no matches)"; // rg found nothing - not an error
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return `search failed: ${e.message}`;
    }

    // ripgrep not installed - try grep (POSIX only, not on stock Windows)
    try {
      const grepArgs = ["-rn", "-E", pattern, "."];
      const { stdout } = await execFileAsync("grep", grepArgs, {
        cwd: ctx.projectRoot,
        maxBuffer: 5 * 1024 * 1024,
      });
      return stdout.trim() || "(no matches)";
    } catch (err) {
      const e = err as { code?: number; message: string };
      if (e.code === 1) return "(no matches)";
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return `search failed: ${e.message}`;
    }

    // Neither external tool is available - fall back to a pure-Node search
    // so this always works, including on a stock Windows machine.
    try {
      return searchWithNodeFallback(ctx.projectRoot, pattern, glob);
    } catch (err) {
      return `search failed: ${(err as Error).message}`;
    }
  },
};

/**
 * Pure-Node fallback used when `git ls-files` fails - most commonly because
 * the directory simply isn't a git repository (a downloaded/extracted
 * project, not a clone), which git reports as a hard "fatal:" error rather
 * than an empty result. Reuses the same directory walk and ignore-list as
 * search_files' own fallback, so listing files works regardless of whether
 * the project happens to be under git.
 */
function listFilesWithNodeFallback(targetDir: string): string {
  const files: string[] = [];
  walk(targetDir, files);
  const relPaths = files.map((f) => relative(targetDir, f).split(sep).join("/")).sort();
  return relPaths.join("\n").trim() || "(no files)";
}

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
    } catch {
      // Not a git repository (or git itself isn't available) - fall back
      // rather than surfacing git's scary "fatal: not a git repository" to
      // the model, which otherwise gives up on exploring the project at all.
      try {
        return listFilesWithNodeFallback(join(ctx.projectRoot, target));
      } catch (err) {
        return `list failed: ${(err as Error).message}`;
      }
    }
  },
};
