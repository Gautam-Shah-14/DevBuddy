import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitFetchTool, gitPullTool } from "../src/tools/gitTools.js";
import { setAutoApprove, PermissionDenied } from "../src/lib/permissions.js";
import { ProjectMemory } from "../src/lib/memory.js";
import { ensureProject } from "../src/lib/project.js";
import type { ToolContext } from "../src/tools/types.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

/**
 * Clones with `core.autocrlf` forced off (fixes the checkout the clone itself
 * performs) and persists the same setting into the new clone's local config
 * (fixes every checkout after that, including the one a later `git pull`
 * performs). Windows runners commonly default `core.autocrlf` to `true`,
 * which rewrites a committed "v1\n" to "v1\r\n" on checkout - these tests
 * compare exact file content, so line endings need to be deterministic
 * across platforms, not whatever the runner's global git config happens to be.
 */
async function gitCloneWithLfEndings(remoteDir: string, targetDir: string): Promise<void> {
  await execFileAsync("git", ["-c", "core.autocrlf=false", "clone", remoteDir, targetDir]);
  await git(targetDir, ["config", "core.autocrlf", "false"]);
}

/** A bare "remote" repo, plus two working clones of it: `origin` (used to push
 *  new commits the test simulates as "upstream changes") and `local` (the
 *  clone the tool under test actually operates on). */
async function setupRemoteAndClones(): Promise<{ remoteDir: string; originClone: string; localClone: string; cleanup: () => void }> {
  const base = mkdtempSync(join(tmpdir(), "devbuddy-gittools-"));
  const remoteDir = join(base, "remote.git");
  const originClone = join(base, "origin-clone");
  const localClone = join(base, "local-clone");

  await git(base, ["init", "--bare", "-b", "main", remoteDir]);
  await gitCloneWithLfEndings(remoteDir, originClone);
  await git(originClone, ["config", "user.email", "test@example.com"]);
  await git(originClone, ["config", "user.name", "Test"]);
  writeFileSync(join(originClone, "file.txt"), "v1\n");
  await git(originClone, ["add", "."]);
  await git(originClone, ["commit", "-m", "initial commit"]);
  await git(originClone, ["push", "origin", "main"]);

  await gitCloneWithLfEndings(remoteDir, localClone);
  await git(localClone, ["config", "user.email", "test@example.com"]);
  await git(localClone, ["config", "user.name", "Test"]);

  return { remoteDir, originClone, localClone, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function buildContext(projectRoot: string, memory: ProjectMemory, sessionId: number): ToolContext {
  const projectPaths = ensureProject(projectRoot);
  return { projectRoot, projectPaths, memory, sessionId, skills: [] };
}

test("git_fetch (auto-approved) downloads new remote commits without touching the working tree", async () => {
  const { originClone, localClone, cleanup } = await setupRemoteAndClones();
  try {
    // Simulate an upstream change made elsewhere.
    writeFileSync(join(originClone, "file.txt"), "v2\n");
    await git(originClone, ["add", "."]);
    await git(originClone, ["commit", "-m", "second commit"]);
    await git(originClone, ["push", "origin", "main"]);

    const memory = new ProjectMemory(localClone);
    const sessionId = memory.startSession("test", "test-model");
    setAutoApprove(true);
    try {
      const result = await gitFetchTool.execute({}, buildContext(localClone, memory, sessionId));
      assert.ok(!result.toLowerCase().includes("failed"), `git_fetch reported failure: ${result}`);
    } finally {
      setAutoApprove(false);
      memory.close();
    }

    // Fetched, but not merged - the working file is still the old content.
    assert.equal(readFileSync(join(localClone, "file.txt"), "utf-8"), "v1\n");
    // The remote-tracking branch did move, though.
    const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%s", "origin/main"], { cwd: localClone });
    assert.equal(stdout.trim(), "second commit");
  } finally {
    cleanup();
  }
});

test("git_pull (auto-approved) fetches and merges remote changes into the working tree", async () => {
  const { originClone, localClone, cleanup } = await setupRemoteAndClones();
  try {
    writeFileSync(join(originClone, "file.txt"), "v2\n");
    await git(originClone, ["add", "."]);
    await git(originClone, ["commit", "-m", "second commit"]);
    await git(originClone, ["push", "origin", "main"]);

    const memory = new ProjectMemory(localClone);
    const sessionId = memory.startSession("test", "test-model");
    setAutoApprove(true);
    try {
      const result = await gitPullTool.execute({}, buildContext(localClone, memory, sessionId));
      assert.ok(!result.toLowerCase().includes("failed"), `git_pull reported failure: ${result}`);
    } finally {
      setAutoApprove(false);
      memory.close();
    }

    assert.equal(readFileSync(join(localClone, "file.txt"), "utf-8"), "v2\n");
  } finally {
    cleanup();
  }
});

test("git_fetch and git_pull both refuse to run in a non-interactive session without auto-approve", async () => {
  const { localClone, cleanup } = await setupRemoteAndClones();
  try {
    const memory = new ProjectMemory(localClone);
    const sessionId = memory.startSession("test", "test-model");
    try {
      await assert.rejects(
        gitFetchTool.execute({}, buildContext(localClone, memory, sessionId)),
        PermissionDenied
      );
      await assert.rejects(
        gitPullTool.execute({}, buildContext(localClone, memory, sessionId)),
        PermissionDenied
      );
    } finally {
      memory.close();
    }
  } finally {
    cleanup();
  }
});
