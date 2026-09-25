import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { configFilePath, getConfig, getEffectiveConfig, type DevBuddyConfig } from "../lib/config.js";
import { devbuddyHome } from "../lib/project.js";
import { getPlan } from "../lib/license.js";
import { OllamaProvider } from "../providers/ollama.js";
import { OpenAiProvider } from "../providers/openai.js";
import { AnthropicProvider } from "../providers/anthropic.js";

const execAsync = promisify(exec);

type Status = "ok" | "warn" | "fail";

interface CheckResult {
  label: string;
  status: Status;
  detail: string;
}

function icon(status: Status): string {
  if (status === "ok") return chalk.green("✓");
  if (status === "warn") return chalk.yellow("⚠");
  return chalk.red("✗");
}

export function checkNode(): CheckResult {
  const major = Number(process.version.slice(1).split(".")[0]);
  if (major >= 18) return { label: "Node.js", status: "ok", detail: `${process.version} (>= 18 required)` };
  return { label: "Node.js", status: "fail", detail: `${process.version} — DevBuddy requires Node 18+` };
}

function checkConfigFile(): CheckResult {
  const path = configFilePath();
  if (!existsSync(path)) {
    return { label: "Config file", status: "warn", detail: `${path} not created yet — defaults will be used` };
  }
  try {
    getConfig();
    return { label: "Config file", status: "ok", detail: path };
  } catch (err) {
    return { label: "Config file", status: "fail", detail: `${path} is corrupt: ${(err as Error).message}` };
  }
}

function checkHomeWritable(): CheckResult {
  const home = devbuddyHome();
  try {
    mkdirSync(home, { recursive: true });
    const probe = join(home, `.doctor-write-test-${process.pid}`);
    writeFileSync(probe, "ok");
    rmSync(probe);
    return { label: "~/.devbuddy writable", status: "ok", detail: home };
  } catch (err) {
    return { label: "~/.devbuddy writable", status: "fail", detail: (err as Error).message };
  }
}

/** statfsSync landed in Node 18.15 - not guaranteed present on the minimum
 *  supported Node 18.0, so this degrades to a warning rather than crashing. */
async function checkDiskSpace(): Promise<CheckResult> {
  const home = devbuddyHome();
  try {
    const fs = await import("node:fs");
    if (typeof fs.statfsSync !== "function") {
      return { label: "Disk space", status: "warn", detail: "Node build too old to report disk space (needs 18.15+)" };
    }
    mkdirSync(home, { recursive: true });
    const stats = fs.statfsSync(home);
    const freeMb = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
    return {
      label: "Disk space",
      status: freeMb < 50 ? "warn" : "ok",
      detail: `${freeMb} MB free at ${home}${freeMb < 50 ? " — memory.db and skills need room to grow" : ""}`,
    };
  } catch (err) {
    return { label: "Disk space", status: "warn", detail: `Could not determine: ${(err as Error).message}` };
  }
}

async function checkGit(): Promise<CheckResult> {
  try {
    const { stdout } = await execAsync("git --version");
    return { label: "git", status: "ok", detail: stdout.trim() };
  } catch {
    return { label: "git", status: "warn", detail: "git not found on PATH — git_status/diff/commit/push tools will fail" };
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execAsync(`${cmd} --version`);
    return true;
  } catch {
    return false;
  }
}

async function checkSearchTooling(): Promise<CheckResult> {
  if (await commandExists("rg")) return { label: "search tooling", status: "ok", detail: "ripgrep found" };
  if (await commandExists("grep")) return { label: "search tooling", status: "ok", detail: "grep found" };
  return {
    label: "search tooling",
    status: "warn",
    detail: "Neither ripgrep nor grep found — search_files falls back to a slower pure-Node search (still works)",
  };
}

async function checkProvider(
  name: "ollama" | "openai" | "anthropic",
  isActive: boolean,
  config: DevBuddyConfig = getConfig()
): Promise<CheckResult> {
  const label = `provider: ${name}${isActive ? " (active)" : ""}`;

  if (name === "ollama") {
    const reachable = await new OllamaProvider().checkConnection();
    if (!reachable) {
      return {
        label,
        status: isActive ? "fail" : "warn",
        detail:
          `Could not reach ${config.host} — if Ollama is already running, try ` +
          `"devbuddy config set host http://127.0.0.1:11434" (a "localhost" IPv6/IPv4 mismatch is the ` +
          `most common cause); otherwise start it with "ollama serve"`,
      };
    }
    const models = await new OllamaProvider().listModels().catch(() => []);
    return { label, status: "ok", detail: `${config.host}, ${models.length} model(s) installed` };
  }

  const apiKey = name === "openai" ? config.openaiApiKey : config.anthropicApiKey;
  if (!apiKey) {
    return {
      label,
      status: isActive ? "fail" : "warn",
      detail: `No API key set — devbuddy provider set-key ${name} <key>`,
    };
  }
  const provider = name === "openai" ? new OpenAiProvider() : new AnthropicProvider();
  const reachable = await provider.checkConnection();
  return {
    label,
    status: reachable ? "ok" : isActive ? "fail" : "warn",
    detail: reachable ? "API key set, endpoint reachable" : "Could not verify — check the key and network connection",
  };
}

export function checkLicense(config: DevBuddyConfig = getConfig()): CheckResult {
  const plan = getPlan();
  const guardrails = config.guardrailsMode !== "off" ? `, guardrails: ${config.guardrailsMode}` : "";
  return { label: "License/plan", status: "ok", detail: `${plan}${guardrails}` };
}

export async function doctorCommand(): Promise<void> {
  console.log(chalk.bold("DevBuddy doctor\n"));
  const projectRoot = resolve(process.cwd());
  const config = getEffectiveConfig(projectRoot);

  const checks = await Promise.all([
    checkNode(),
    checkConfigFile(),
    checkHomeWritable(),
    checkDiskSpace(),
    checkGit(),
    checkSearchTooling(),
    checkProvider("ollama", config.provider === "ollama", config),
    checkProvider("openai", config.provider === "openai", config),
    checkProvider("anthropic", config.provider === "anthropic", config),
    checkLicense(config),
  ]);

  for (const c of checks) {
    console.log(`${icon(c.status)} ${chalk.bold(c.label)} — ${c.detail}`);
  }

  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;

  console.log();
  if (failed > 0) {
    console.log(chalk.red(`${failed} check(s) failed, ${warned} warning(s). Fix the above before relying on devbuddy chat.`));
    process.exitCode = 1;
  } else if (warned > 0) {
    console.log(chalk.yellow(`All critical checks passed, ${warned} warning(s) - see above.`));
  } else {
    console.log(chalk.green("Everything looks good."));
  }
}
