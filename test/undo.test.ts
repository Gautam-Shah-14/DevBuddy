import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectMemory } from "../src/lib/memory.js";
import { undoCommand } from "../src/commands/undo.js";

function withTempProject<T>(fn: (projectRoot: string) => Promise<T>): Promise<T> {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-undo-"));
  return fn(projectRoot).finally(() => rmSync(projectRoot, { recursive: true, force: true }));
}

test("ProjectMemory checkpoints: getLatestCheckpoint returns the most recent unreverted one", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");

    assert.equal(memory.getLatestCheckpoint(), null);

    const id1 = memory.addCheckpoint(sessionId, "write_file", "a.txt", false, null);
    const id2 = memory.addCheckpoint(sessionId, "edit_file", "a.txt", true, "before edit");

    const latest = memory.getLatestCheckpoint();
    assert.equal(latest?.id, id2);
    assert.equal(latest?.contentBefore, "before edit");

    memory.markCheckpointReverted(id2);
    const nextLatest = memory.getLatestCheckpoint();
    assert.equal(nextLatest?.id, id1);

    memory.close();
  }));

test("ProjectMemory.listCheckpoints returns newest first, including reverted ones", () =>
  withTempProject(async (projectRoot) => {
    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    memory.addCheckpoint(sessionId, "write_file", "a.txt", false, null);
    memory.addCheckpoint(sessionId, "write_file", "b.txt", false, null);

    const list = memory.listCheckpoints();
    assert.equal(list.length, 2);
    assert.equal(list[0].filePath, "b.txt");
    assert.equal(list[1].filePath, "a.txt");
    memory.close();
  }));

// undoCommand resolves the project from process.cwd(), so these tests chdir
// into the temp project and always restore the original cwd afterward.
async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(original);
  }
}

test("devbuddy undo restores edited content, then deletes a file that didn't exist before", () =>
  withTempProject(async (projectRoot) => {
    const filePath = join(projectRoot, "hello.txt");

    const memory = new ProjectMemory(projectRoot);
    const sessionId = memory.startSession("test", "test-model");
    memory.addCheckpoint(sessionId, "write_file", "hello.txt", false, null);
    writeFileSync(filePath, "version 1\n");
    memory.addCheckpoint(sessionId, "edit_file", "hello.txt", true, "version 1\n");
    writeFileSync(filePath, "version 2\n");
    memory.close();

    await withCwd(projectRoot, () => undoCommand([]));
    assert.equal(readFileSync(filePath, "utf-8"), "version 1\n");

    await withCwd(projectRoot, () => undoCommand([]));
    assert.equal(existsSync(filePath), false);
  }));

test("devbuddy undo is a no-op when there is nothing recorded", () =>
  withTempProject((projectRoot) => withCwd(projectRoot, () => undoCommand([]))));
