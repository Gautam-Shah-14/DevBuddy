import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ProviderName = "ollama" | "openai";

export type GuardrailsMode = "off" | "mask" | "block";

export interface DevBuddyConfig {
  provider: ProviderName;
  host: string; // Ollama host
  model: string;
  systemPrompt: string;
  openaiApiKey: string;
  openaiBaseUrl: string; // OpenAI-compatible endpoint (OpenAI, OpenRouter, etc.)
  licenseKey: string; // empty = free plan; a valid signed key unlocks Pro features
  guardrailsMode: GuardrailsMode; // Pro-only: PII/secret masking or blocking before AI calls
}

/** Config keys whose values should never be printed in full (API keys, secrets). */
export const SECRET_KEYS: (keyof DevBuddyConfig)[] = ["openaiApiKey", "licenseKey"];

const DEFAULT_CONFIG: DevBuddyConfig = {
  provider: "ollama",
  host: "http://localhost:11434",
  model: "llama3.1",
  systemPrompt:
    "You are DevBuddy, a concise, practical developer assistant running fully on the user's local machine. Prefer short, actionable answers with code when useful.",
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  licenseKey: "",
  guardrailsMode: "off",
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
