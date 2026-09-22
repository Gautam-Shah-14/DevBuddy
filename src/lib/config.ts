import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DevBuddyConfig {
  host: string;
  model: string;
  systemPrompt: string;
}

const DEFAULT_CONFIG: DevBuddyConfig = {
  host: "http://localhost:11434",
  model: "llama3.1",
  systemPrompt:
    "You are DevBuddy, a concise, practical developer assistant running fully on the user's local machine. Prefer short, actionable answers with code when useful.",
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
  cached = updated;
  return updated;
}

export function configFilePath(): string {
  return CONFIG_PATH;
}
