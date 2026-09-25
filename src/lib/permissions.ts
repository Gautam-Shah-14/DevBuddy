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

export type PermissionCategory =
  | "shell"
  | "write"
  | "delete"
  | "git_push"
  | "git_pull"
  | "network"
  | "mcp"
  | "mcp_connect";

export interface PermissionRequest {
  category: PermissionCategory;
  description: string; // human-readable summary of the exact action, e.g. the shell command
  diff?: string | null; // pre-rendered, colored diff to show before the confirm prompt
}

/**
 * Tracks which exact actions the user has already approved-for-the-session
 * (`allow for this session`), keyed by category + description rather than
 * category alone: remembering "shell" or "write" as a whole would auto-run
 * any future shell command or file write the model comes up with for the
 * rest of the session, including ones with nothing in common with the one
 * actually approved. Keying on the exact description means "yes, always run
 * `npm test`" doesn't also silently approve `rm -rf /` later - the same
 * category, but a different action, still asks.
 */
const sessionAllowed = new Set<string>();

function sessionKey(category: PermissionCategory, description: string): string {
  return `${category}:${description}`;
}

/** Categories that always require a fresh prompt, no matter what — never auto-allowed for a session. */
const ALWAYS_CONFIRM: ReadonlySet<PermissionCategory> = new Set(["delete", "git_push", "git_pull"]);

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
  git_pull: "wants to pull from git",
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
 * Whether a free-typed answer means "remember this for the session" - not
 * just the exact "2"/"a"/"always", but a natural phrasing like "yes and
 * don't ask again this session" too. Checked before isAffirmative() since
 * such a phrase usually also contains "yes".
 */
function isRememberChoice(normalized: string): boolean {
  return (
    normalized === "2" ||
    normalized === "a" ||
    /\balways\b/.test(normalized) ||
    /\bremember\b/.test(normalized) ||
    /don'?t ask/.test(normalized)
  );
}

/**
 * Whether a free-typed answer means "yes" - exact "1"/"y"/"yes" or an
 * unambiguous affirmative phrasing. Deliberately conservative: this gates
 * risky actions, so words like "sure" or "correct" are excluded since they
 * also appear in negations ("not sure", "correct me if I'm wrong") - a
 * false approval here is worse than an unnecessary re-prompt.
 */
function isAffirmative(normalized: string): boolean {
  return normalized === "1" || /^y$/.test(normalized) || /\b(yes|yeah|yep|yup)\b/.test(normalized);
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
 * throws PermissionDenied otherwise. "Don't ask again this session" is
 * remembered per exact action (category + description), never per whole
 * category, and never for a category in ALWAYS_CONFIRM.
 */
export async function requestPermission(req: PermissionRequest): Promise<void> {
  if (!ALWAYS_CONFIRM.has(req.category) && sessionAllowed.has(sessionKey(req.category, req.description))) {
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
  const options = canRemember ? ["Yes", "Yes, and don't ask again for this in this session", "No"] : ["Yes", "No"];
  options.forEach((label, i) => console.log(`  ${chalk.dim(`${i + 1}.`)} ${label}`));
  console.log();

  const raw = (await ask(chalk.hex(ACCENT).bold("  ❯ "))).trim().toLowerCase();
  console.log();

  if (canRemember && isRememberChoice(raw)) {
    sessionAllowed.add(sessionKey(req.category, req.description));
    return;
  }
  if (isAffirmative(raw)) {
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
  return isAffirmative(raw);
}

/**
 * Pauses the turn to ask the user a clarifying question, for the `clarify`
 * tool. Returns null in a non-interactive session (no one to ask - the
 * caller should proceed on its own judgment and say so, same as
 * `requestPermission` refusing rather than hanging) or when auto-approve is
 * on (a scripted run has nobody attending it either).
 */
export async function askClarifyingQuestion(question: string, options?: string[]): Promise<string | null> {
  if (autoApproveAll || !process.stdin.isTTY) return null;

  console.log();
  console.log(`${chalk.hex(ACCENT).bold("⏺")} ${chalk.bold("DevBuddy needs a decision before continuing")}`);
  console.log(indentBlock(question));
  console.log();
  if (options && options.length > 0) {
    options.forEach((label, i) => console.log(`  ${chalk.dim(`${i + 1}.`)} ${label}`));
    console.log();
  }
  const raw = (await ask(chalk.hex(ACCENT).bold("  ❯ "))).trim();
  console.log();

  if (options && options.length > 0) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1];
  }
  return raw;
}
