import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfigValue, loadProjectConfigOverrides, getEffectiveConfig, PROJECT_CONFIG_KEYS } from "../src/lib/config.js";

function withTempProject<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-project-config-"));
  try {
    return fn(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function writeRepoConfig(projectRoot: string, content: unknown): void {
  const dir = join(projectRoot, ".devbuddy");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(content));
}

test("loadProjectConfigOverrides returns {} when there is no .devbuddy/config.json", () =>
  withTempProject((projectRoot) => {
    assert.deepEqual(loadProjectConfigOverrides(projectRoot), {});
  }));

test("loadProjectConfigOverrides returns {} for a corrupt .devbuddy/config.json", () =>
  withTempProject((projectRoot) => {
    const dir = join(projectRoot, ".devbuddy");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "config.json"), "{not valid json");
    assert.deepEqual(loadProjectConfigOverrides(projectRoot), {});
  }));

test("loadProjectConfigOverrides only passes through the safe allowlist", () =>
  withTempProject((projectRoot) => {
    writeRepoConfig(projectRoot, {
      provider: "anthropic",
      model: "claude-sonnet-5",
      openaiApiKey: "sk-should-never-be-read-from-here",
      licenseKey: "also-should-not-load",
      notARealKey: "ignored",
    });
    const overrides = loadProjectConfigOverrides(projectRoot);
    assert.deepEqual(overrides, { provider: "anthropic", model: "claude-sonnet-5" });
    assert.ok(!("openaiApiKey" in overrides));
    assert.ok(!("licenseKey" in overrides));
  }));

test("PROJECT_CONFIG_KEYS never includes a secret-shaped field", () => {
  for (const key of PROJECT_CONFIG_KEYS) {
    assert.doesNotMatch(key, /key|token|secret/i, `${key} looks like a secret and must never be committable`);
  }
});

test("getEffectiveConfig layers the project's committed overrides on top of the user's own config", () =>
  withTempProject((projectRoot) => {
    setConfigValue("provider", "ollama");
    setConfigValue("model", "llama3.1");
    setConfigValue("host", "http://localhost:11434");

    writeRepoConfig(projectRoot, { provider: "anthropic", model: "claude-sonnet-5" });

    const effective = getEffectiveConfig(projectRoot);
    assert.equal(effective.provider, "anthropic");
    assert.equal(effective.model, "claude-sonnet-5");
    // host has no project override, so it still comes from the user's own config
    assert.equal(effective.host, "http://localhost:11434");
  }));

test("getEffectiveConfig falls back to the user's own config with no project overrides file", () =>
  withTempProject((projectRoot) => {
    setConfigValue("provider", "openai");
    const effective = getEffectiveConfig(projectRoot);
    assert.equal(effective.provider, "openai");
  }));
