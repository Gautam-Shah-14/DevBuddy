import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listFilesTool } from "../src/tools/searchTools.js";
import { ProjectMemory } from "../src/lib/memory.js";
import { ensureProject } from "../src/lib/project.js";
import type { ToolContext } from "../src/tools/types.js";

const execFileAsync = promisify(execFile);

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-searchtools-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

function buildContext(projectRoot: string, memory: ProjectMemory, sessionId: number): ToolContext {
  return { projectRoot, projectPaths: ensureProject(projectRoot), memory, sessionId, skills: [] };
}

test("list_files falls back to a plain directory walk when the project isn't a git repository", () =>
  withTempProject(async (projectRoot) => {
    // Deliberately NOT a git repo - this is exactly what broke before: git
    // ls-files fails with "fatal: not a git repository" and the tool used
    // to just return that scary error verbatim instead of listing anything.
    writeFileSync(join(projectRoot, "package.json"), "{}");
    writeFileSync(join(projectRoot, "README.md"), "# hi");
    mkdirSync(join(projectRoot, "src"));
    writeFileSync(join(projectRoot, "src", "index.ts"), "export {}");
    mkdirSync(join(projectRoot, "node_modules")); // should be excluded, like search_files' own fallback
    writeFileSync(join(projectRoot, "node_modules", "junk.js"), "");

    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    try {
      const result = await listFilesTool.execute({}, buildContext(projectRoot, memory, sessionId));
      assert.ok(!result.toLowerCase().includes("fatal"), `raw git error leaked through: ${result}`);
      assert.ok(!result.toLowerCase().includes("list failed"));
      assert.match(result, /package\.json/);
      assert.match(result, /README\.md/);
      assert.match(result, /src\/index\.ts/);
      assert.ok(!result.includes("node_modules"), "node_modules should be excluded from the fallback listing");
    } finally {
      memory.close();
    }
  }));

test("list_files still uses git ls-files (respecting .gitignore) when the project IS a git repo", () =>
  withTempProject(async (projectRoot) => {
    await execFileAsync("git", ["init", "-q"], { cwd: projectRoot });
    await execFileAsync("git", ["config", "user.email", "t@example.com"], { cwd: projectRoot });
    await execFileAsync("git", ["config", "user.name", "T"], { cwd: projectRoot });
    writeFileSync(join(projectRoot, ".gitignore"), "ignored.txt\n");
    writeFileSync(join(projectRoot, "tracked.txt"), "hi");
    writeFileSync(join(projectRoot, "ignored.txt"), "should not show up");
    await execFileAsync("git", ["add", "tracked.txt", ".gitignore"], { cwd: projectRoot });
    await execFileAsync("git", ["commit", "-q", "-m", "initial"], { cwd: projectRoot });

    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    try {
      const result = await listFilesTool.execute({}, buildContext(projectRoot, memory, sessionId));
      assert.match(result, /tracked\.txt/);
      assert.ok(!result.includes("ignored.txt"), "gitignored file should not be listed via git ls-files");
    } finally {
      memory.close();
    }
  }));

test("list_files reports '(no files)' for an empty, non-git directory", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    try {
      const result = await listFilesTool.execute({}, buildContext(projectRoot, memory, sessionId));
      assert.equal(result, "(no files)");
    } finally {
      memory.close();
    }
  }));
