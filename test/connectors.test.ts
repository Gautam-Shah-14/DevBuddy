import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addConnector, loadConnectors, removeConnector, setConnectorEnabled } from "../src/lib/connectors.js";
import { repoConnectorsFile } from "../src/lib/project.js";

function withTempProject<T>(fn: (projectRoot: string) => T): T {
  const projectRoot = mkdtempSync(join(tmpdir(), "devbuddy-connectors-"));
  try {
    return fn(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("addConnector with a projectRoot writes to the repo's shared connectors.json, not the user's own", () =>
  withTempProject((projectRoot) => {
    addConnector({ name: "shared-one", command: "npx", args: ["-y", "thing"], enabled: true }, projectRoot);

    const raw = JSON.parse(readFileSync(repoConnectorsFile(projectRoot), "utf-8"));
    assert.equal(raw.length, 1);
    assert.equal(raw[0].name, "shared-one");
    assert.ok(!("shared" in raw[0]), "the shared marker is read-time only, never persisted");
  }));

test("loadConnectors merges the user's own connectors with a project's shared ones", () =>
  withTempProject((projectRoot) => {
    addConnector({ name: "shared-one", command: "npx", args: [], enabled: true }, projectRoot);

    const withProject = loadConnectors(projectRoot);
    assert.equal(withProject.length, 1);
    assert.equal(withProject[0].shared, true);

    const withoutProject = loadConnectors();
    assert.equal(withoutProject.some((c) => c.name === "shared-one"), false);
  }));

test("a shared connector overrides a same-named one in the user's own config when merged", () =>
  withTempProject((projectRoot) => {
    addConnector({ name: "dup", command: "own-command", args: [], enabled: true }); // user's own, global
    addConnector({ name: "dup", command: "shared-command", args: [], enabled: true }, projectRoot);

    const merged = loadConnectors(projectRoot);
    const match = merged.find((c) => c.name === "dup");
    assert.equal(match?.command, "shared-command");
    assert.equal(match?.shared, true);

    removeConnector("dup"); // clean up the global entry this test added
  }));

test("removeConnector and setConnectorEnabled operate on the project file when projectRoot is given", () =>
  withTempProject((projectRoot) => {
    addConnector({ name: "toggle-me", command: "npx", args: [], enabled: true }, projectRoot);

    assert.equal(setConnectorEnabled("toggle-me", false, projectRoot), true);
    assert.equal(loadConnectors(projectRoot).find((c) => c.name === "toggle-me")?.enabled, false);

    assert.equal(removeConnector("toggle-me", projectRoot), true);
    assert.equal(loadConnectors(projectRoot).length, 0);
  }));
