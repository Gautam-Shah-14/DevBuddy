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

export type PermissionCategory = "shell" | "write" | "delete" | "git_push" | "network" | "mcp";

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

/**
 * Prompts the user to approve a risky action. Resolves silently if approved,
 * throws PermissionDenied otherwise. Session-wide "allow all" is remembered
 * per category (except categories in ALWAYS_CONFIRM).
 */
export async function requestPermission(req: PermissionRequest): Promise<void> {
  if (!ALWAYS_CONFIRM.has(req.category) && sessionAllowed.has(req.category)) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new PermissionDenied(
      `Refusing "${req.category}" action in a non-interactive session: ${req.description}`
    );
  }

  console.log(chalk.yellow(`\nDevBuddy wants to perform a ${chalk.bold(req.category)} action:`));
  console.log(chalk.dim(req.description));
  if (req.diff) console.log(`\n${req.diff}\n`);
  const canRemember = !ALWAYS_CONFIRM.has(req.category);
  const prompt = canRemember
    ? "Allow? [y]es / [n]o / [a]lways this session: "
    : "Allow? [y]es / [n]o: ";
  const answer = (await ask(prompt)).trim().toLowerCase();

  if (answer === "a" && canRemember) {
    sessionAllowed.add(req.category);
    return;
  }
  if (answer === "y" || answer === "yes") {
    return;
  }
  throw new PermissionDenied(`User denied ${req.category} action: ${req.description}`);
}

export function resetSessionPermissions(): void {
  sessionAllowed.clear();
}

/** Shows a proposed plan to the user and asks for approval before any of its steps run. */
export async function confirmPlan(title: string, planText: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  console.log(chalk.cyan(`\nDevBuddy proposes a plan: ${chalk.bold(title)}\n`));
  console.log(planText);
  const answer = (await ask(chalk.cyan("\nApprove this plan? [y]es / [n]o: "))).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}
