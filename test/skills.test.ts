import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSkills } from "../src/lib/skills.js";
import { globalSkillsDir } from "../src/lib/project.js";

function writeSkill(dir: string, fileName: string, name: string, description: string, body = "instructions"): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
}

function withTempDirs<T>(fn: (localDir: string, sharedDir: string) => T): T {
  const base = mkdtempSync(join(tmpdir(), "devbuddy-skills-"));
  try {
    return fn(join(base, "local-skills"), join(base, "shared-skills"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("loadSkills returns nothing when no skill directories exist", () =>
  withTempDirs((localDir, sharedDir) => {
    assert.deepEqual(loadSkills(localDir, sharedDir), []);
  }));

test("loadSkills tags each skill with where it came from", () =>
  withTempDirs((localDir, sharedDir) => {
    writeSkill(sharedDir, "team.md", "team-conventions", "shared team skill");
    writeSkill(localDir, "mine.md", "my-private-skill", "local-only skill");

    const skills = loadSkills(localDir, sharedDir);
    const byName = new Map(skills.map((s) => [s.name, s]));
    assert.equal(byName.get("team-conventions")?.source, "shared");
    assert.equal(byName.get("my-private-skill")?.source, "project");
  }));

test("loadSkills lets a project-local skill override a same-named shared one, which overrides global", () =>
  withTempDirs((localDir, sharedDir) => {
    // Global skills live under the real ~/.devbuddy/skills, so this writes
    // there too (like the rest of the codebase's tests touch real config) -
    // a unique name plus cleanup keeps it from leaking into other tests.
    const globalFile = join(globalSkillsDir(), "__devbuddy_test_override__.md");
    writeSkill(globalSkillsDir(), "__devbuddy_test_override__.md", "devbuddy-test-override", "desc", "global version");
    writeSkill(sharedDir, "override.md", "devbuddy-test-override", "desc", "shared version");
    writeSkill(localDir, "override.md", "devbuddy-test-override", "desc", "local version");

    try {
      const skills = loadSkills(localDir, sharedDir);
      const match = skills.find((s) => s.name === "devbuddy-test-override");
      assert.equal(match?.source, "project");
      assert.equal(match?.content, "local version");
    } finally {
      if (existsSync(globalFile)) rmSync(globalFile);
    }
  }));

test("loadSkills works with no sharedSkillsDir argument at all (backward compatible)", () =>
  withTempDirs((localDir) => {
    writeSkill(localDir, "solo.md", "solo-skill", "just local");
    const skills = loadSkills(localDir);
    assert.equal(skills.some((s) => s.name === "solo-skill"), true);
  }));
