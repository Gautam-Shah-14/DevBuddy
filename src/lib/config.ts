import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { repoConfigFile } from "./project.js";

export type ProviderName = "ollama" | "openai" | "anthropic";

export type GuardrailsMode = "off" | "mask" | "block";

export interface DevBuddyConfig {
  provider: ProviderName;
  host: string; // Ollama host
  model: string;
  systemPrompt: string;
  openaiApiKey: string;
  openaiBaseUrl: string; // OpenAI-compatible endpoint (OpenAI, OpenRouter, etc.)
  anthropicApiKey: string;
  anthropicBaseUrl: string; // Anthropic Messages API endpoint
  licenseKey: string; // empty = free plan; a valid signed key unlocks Pro features
  guardrailsMode: GuardrailsMode; // Pro-only: PII/secret masking or blocking before AI calls
  /** Command run after the agent edits files, to self-verify the change. Empty = auto-detect
   *  `npm test` from package.json; "off" disables verification entirely. */
  verifyCommand: string;
  /** Estimated-token threshold (as a string, parsed with Number()) for auto-compacting a long
   *  chat session's history into a summary. "off" disables auto-compaction (manual /compact
   *  in the REPL still works). Must stay comfortably below `contextWindow` (see below) to leave
   *  room for the system prompt, tool schemas, and the model's own response. */
  compactThreshold: string;
  /** Ollama's `num_ctx` (context window, in tokens), sent with every chat request. Ollama
   *  otherwise silently falls back to a small built-in default (often 2048-4096 tokens) and
   *  quietly truncates older messages once it's exceeded - which looks like DevBuddy is
   *  compacting far too aggressively, or the model "forgetting" earlier parts of the
   *  conversation, when the real cause is this default never having been raised. Not used by
   *  the OpenAI/Anthropic providers, which size their own context server-side. */
  contextWindow: string;
}

/** Config keys whose values should never be printed in full (API keys, secrets). */
export const SECRET_KEYS: (keyof DevBuddyConfig)[] = ["openaiApiKey", "anthropicApiKey", "licenseKey"];

const DEFAULT_CONFIG: DevBuddyConfig = {
  provider: "ollama",
  // A literal IPv4 address, not "localhost": Node's fetch (undici) can resolve
  // "localhost" to the IPv6 ::1 first depending on the OS/Node version, and
  // Ollama by default binds only to the IPv4 127.0.0.1 - "localhost" then
  // fails to connect even though curl (which usually prefers IPv4 for
  // "localhost") and a browser reach it fine, making Ollama look unreachable
  // when it's actually running and working.
  host: "http://127.0.0.1:11434",
  model: "llama3.1",
  systemPrompt:
    "You are DevBuddy, a concise, practical developer assistant running fully on the user's local machine. Prefer short, actionable answers with code when useful.",
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  anthropicApiKey: "",
  anthropicBaseUrl: "https://api.anthropic.com/v1",
  licenseKey: "",
  guardrailsMode: "off",
  verifyCommand: "",
  // Paired with contextWindow below: leaves ~5000 tokens of headroom within the
  // default 16384-token window for the system prompt, tool schemas, and the
  // model's response, instead of cutting it close enough to compact almost
  // every turn on any conversation that reads a file or lists a directory.
  compactThreshold: "11000",
  contextWindow: "16384",
};

const CONFIG_DIR = join(homedir(), ".devbuddy");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

let cached: DevBuddyConfig | null = null;

export function getConfig(): DevBuddyConfig {
  if (cached) return cached;

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      cached = { ...DEFAULT_CONFIG, ...raw };
      return cached!;
    } catch {
      // fall through to defaults on corrupt config
    }
  }

  cached = { ...DEFAULT_CONFIG };
  return cached;
}

export function setConfigValue(key: keyof DevBuddyConfig, value: string): DevBuddyConfig {
  const current = getConfig();
  const updated = { ...current, [key]: value };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
  chmodSync(CONFIG_PATH, 0o600); // config may hold API keys - keep it readable only by the owner
  cached = updated;
  return updated;
}

export function maskSecret(value: string): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}

export function configFilePath(): string {
  return CONFIG_PATH;
}

/**
 * Non-secret config keys a team can safely commit to a repo's .devbuddy/
 * config.json so everyone gets the same defaults (which provider/model to
 * use, a shared system prompt, a project's verify command) without sharing
 * API keys or license state. Anything not in this list is ignored if a
 * repo config.json somehow contains it - never trust that file with secrets.
 */
export const PROJECT_CONFIG_KEYS: (keyof DevBuddyConfig)[] = [
  "provider",
  "model",
  "systemPrompt",
  "verifyCommand",
  "guardrailsMode",
  "compactThreshold",
  "contextWindow",
];

/** Reads a project's committed .devbuddy/config.json, if any, filtered to the safe allowlist above. */
export function loadProjectConfigOverrides(projectRoot: string): Partial<DevBuddyConfig> {
  const file = repoConfigFile(projectRoot);
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
    const overrides: Partial<DevBuddyConfig> = {};
    for (const key of PROJECT_CONFIG_KEYS) {
      if (raw[key] !== undefined) (overrides as Record<string, unknown>)[key] = raw[key];
    }
    return overrides;
  } catch {
    return {}; // corrupt repo config.json - fall back to the user's own config
  }
}

/**
 * The config DevBuddy actually runs a project with: the user's own
 * ~/.devbuddy/config.json (host, API keys, license - always local), with a
 * committed .devbuddy/config.json in the project layered on top for the
 * shared, non-secret fields. The project file wins on those fields so a
 * team's checked-in defaults take effect without every member reconfiguring
 * their own machine; secrets always come from the user's own config.
 */
export function getEffectiveConfig(projectRoot: string): DevBuddyConfig {
  return { ...getConfig(), ...loadProjectConfigOverrides(projectRoot) };
}
