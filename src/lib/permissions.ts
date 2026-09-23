import { createInterface } from "node:readline/promises";
import chalk from "chalk";

export type PermissionCategory = "shell" | "write" | "delete" | "git_push" | "network";

export interface PermissionRequest {
  category: PermissionCategory;
  description: string; // human-readable summary of the exact action, e.g. the shell command
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

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(chalk.yellow(`\nDevBuddy wants to perform a ${chalk.bold(req.category)} action:`));
    console.log(chalk.dim(req.description));
    const canRemember = !ALWAYS_CONFIRM.has(req.category);
    const prompt = canRemember
      ? "Allow? [y]es / [n]o / [a]lways this session: "
      : "Allow? [y]es / [n]o: ";
    const answer = (await rl.question(prompt)).trim().toLowerCase();

    if (answer === "a" && canRemember) {
      sessionAllowed.add(req.category);
      return;
    }
    if (answer === "y" || answer === "yes") {
      return;
    }
    throw new PermissionDenied(`User denied ${req.category} action: ${req.description}`);
  } finally {
    rl.close();
  }
}

export function resetSessionPermissions(): void {
  sessionAllowed.clear();
}

/** Shows a proposed plan to the user and asks for approval before any of its steps run. */
export async function confirmPlan(title: string, planText: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(chalk.cyan(`\nDevBuddy proposes a plan: ${chalk.bold(title)}\n`));
    console.log(planText);
    const answer = (await rl.question(chalk.cyan("\nApprove this plan? [y]es / [n]o: "))).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
