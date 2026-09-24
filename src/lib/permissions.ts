import { createInterface, type Interface } from "node:readline/promises";
import chalk from "chalk";

/**
 * A single shared readline interface for the whole process. Prompts here
 * (permission checks, plan approval) run interleaved with the main chat
 * REPL's own prompt, and creating a second Interface on the same stdin
 * while one is already open causes both to fight over terminal input and
 * hang. The REPL registers its interface via setSharedReadline(); if none
 * is registered (e.g. a script using these functions standalone), a
 * throwaway one is created and closed per call.
 */
let sharedRl: Interface | null = null;

export function setSharedReadline(rl: Interface | null): void {
  sharedRl = rl;
}

async function ask(prompt: string): Promise<string> {
  if (sharedRl) return sharedRl.question(prompt);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

export type PermissionCategory = "shell" | "write" | "delete" | "git_push" | "network" | "mcp" | "mcp_connect";

export interface PermissionRequest {
  category: PermissionCategory;
  description: string; // human-readable summary of the exact action, e.g. the shell command
  diff?: string | null; // pre-rendered, colored diff to show before the confirm prompt
}

/**
 * Tracks which categories the user has already blanket-approved for this
 * running session (`allow for this session`), so we don't re-prompt for
 * every single call of the same kind of action.
 */
const sessionAllowed = new Set<PermissionCategory>();

/** Categories that always require a fresh prompt, no matter what — never auto-allowed for a session. */
const ALWAYS_CONFIRM: ReadonlySet<PermissionCategory> = new Set(["delete", "git_push"]);

export function isAlwaysConfirmed(category: PermissionCategory): boolean {
  return ALWAYS_CONFIRM.has(category);
}

export class PermissionDenied extends Error {}

/** Brand accent used for the "⏺" marker, matching the chat REPL's turn markers. */
const ACCENT = "#3b82f6";

const CATEGORY_LABELS: Record<PermissionCategory, string> = {
  shell: "wants to run a shell command",
  write: "wants to write a file",
  delete: "wants to delete a file",
  git_push: "wants to push to git",
  network: "wants to make a network request",
  mcp: "wants to call an MCP tool",
  mcp_connect: "wants to start an MCP server",
};

function indentBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

/**
 * Set by `devbuddy run --yes` to approve every risky action without
 * prompting - there's no human attached to a non-interactive/scripted
 * invocation to ask. Off by default, including for the interactive REPL.
 */
let autoApproveAll = false;

export function setAutoApprove(enabled: boolean): void {
  autoApproveAll = enabled;
}

/**
 * Prompts the user to approve a risky action. Resolves silently if approved,
 * throws PermissionDenied otherwise. Session-wide "allow all" is remembered
 * per category (except categories in ALWAYS_CONFIRM).
 */
export async function requestPermission(req: PermissionRequest): Promise<void> {
  if (!ALWAYS_CONFIRM.has(req.category) && sessionAllowed.has(req.category)) {
    return;
  }

  if (autoApproveAll) {
    console.log(chalk.dim(`[auto-approved] ${req.category}: ${req.description}`));
    return;
  }

  if (!process.stdin.isTTY) {
    throw new PermissionDenied(
      `Refusing "${req.category}" action in a non-interactive session: ${req.description}. ` +
        `Pass --yes to "devbuddy run" to auto-approve risky actions in scripts/CI.`
    );
  }

  console.log();
  console.log(`${chalk.hex(ACCENT).bold("⏺")} ${chalk.bold(`DevBuddy ${CATEGORY_LABELS[req.category]}`)}`);
  console.log(chalk.dim(indentBlock(req.description)));
  if (req.diff) {
    console.log();
    console.log(indentBlock(req.diff));
  }
  console.log();

  const canRemember = !ALWAYS_CONFIRM.has(req.category);
  const options = canRemember ? ["Yes", "Yes, and don't ask again this session", "No"] : ["Yes", "No"];
  options.forEach((label, i) => console.log(`  ${chalk.dim(`${i + 1}.`)} ${label}`));
  console.log();

  const raw = (await ask(chalk.hex(ACCENT).bold("  ❯ "))).trim().toLowerCase();
  console.log();

  if (canRemember && (raw === "2" || raw === "a" || raw === "always")) {
    sessionAllowed.add(req.category);
    return;
  }
  if (raw === "1" || raw === "y" || raw === "yes") {
    return;
  }
  throw new PermissionDenied(`User denied ${req.category} action: ${req.description}`);
}

export function resetSessionPermissions(): void {
  sessionAllowed.clear();
}

/** Shows a proposed plan to the user and asks for approval before any of its steps run. */
export async function confirmPlan(title: string, planText: string): Promise<boolean> {
  if (autoApproveAll) {
    console.log(chalk.dim(`[auto-approved] plan: ${title}`));
    return true;
  }
  if (!process.stdin.isTTY) return false;

  console.log();
  console.log(`${chalk.hex(ACCENT).bold("⏺")} ${chalk.bold(`Proposed plan: ${title}`)}`);
  console.log();
  console.log(indentBlock(planText));
  console.log();
  console.log(`  ${chalk.dim("1.")} Yes, proceed`);
  console.log(`  ${chalk.dim("2.")} No`);
  console.log();
  const raw = (await ask(chalk.hex(ACCENT).bold("  ❯ "))).trim().toLowerCase();
  console.log();
  return raw === "1" || raw === "y" || raw === "yes";
}
