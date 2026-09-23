import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const execAsync = promisify(exec);

/** Tool names whose successful execution mutates the project's files - the
 *  self-verification loop only runs after one of these actually ran. */
export const MUTATING_TOOLS: ReadonlySet<string> = new Set(["write_file", "edit_file", "delete_file"]);

/**
 * Resolves the command to run after the agent edits files. An explicit
 * `configured` value always wins ("off" disables auto-detection entirely);
 * otherwise falls back to `npm test` when the project's package.json has a
 * real test script (not the "no test specified" placeholder npm init writes).
 */
export function detectVerifyCommand(projectRoot: string, configured: string): string | null {
  if (configured === "off") return null;
  if (configured) return configured;

  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
    const testScript = pkg.scripts?.test;
    if (testScript && !testScript.includes("no test specified")) return "npm test";
  } catch {
    // corrupt/unreadable package.json - no auto-detected command
  }
  return null;
}

const MAX_OUTPUT_CHARS = 4000;

export interface VerifyResult {
  command: string;
  passed: boolean;
  /** Combined stdout+stderr, tail-truncated so it's cheap to feed back to the model. */
  output: string;
}

/** Runs the verification command in the project root and reports pass/fail with captured output. */
export async function runVerification(projectRoot: string, command: string): Promise<VerifyResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { command, passed: true, output: tail(stdout + stderr) };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    const combined = (e.stdout ?? "") + (e.stderr ?? "");
    return { command, passed: false, output: tail(combined || e.message) };
  }
}

function tail(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? `...(truncated)...\n${text.slice(-MAX_OUTPUT_CHARS)}` : text;
}
