import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ProjectMeta {
  path: string;
  name: string;
  created_at: string;
  last_opened_at: string;
}

const DEVBUDDY_HOME = join(homedir(), ".devbuddy");

export function devbuddyHome(): string {
  return DEVBUDDY_HOME;
}

export function projectId(absPath: string): string {
  return createHash("sha256").update(absPath).digest("hex").slice(0, 16);
}

export interface ProjectPaths {
  root: string; // ~/.devbuddy/projects/<id>
  metaFile: string;
  dbFile: string;
  skillsDir: string;
  plansDir: string;
  /** Durable notes the agent writes itself (via the "remember" tool) across turns and
   *  sessions - facts already discovered, decisions already made - loaded into the
   *  system prompt every turn so the same ground doesn't get re-covered every time. */
  notesFile: string;
}

export function projectPaths(absPath: string): ProjectPaths {
  const id = projectId(absPath);
  const root = join(DEVBUDDY_HOME, "projects", id);
  return {
    root,
    metaFile: join(root, "meta.json"),
    dbFile: join(root, "memory.db"),
    skillsDir: join(root, "skills"),
    plansDir: join(root, "plans"),
    notesFile: join(root, "memory.md"),
  };
}

/** Ensures the ~/.devbuddy directory structure exists for this project, creating or touching meta.json. */
export function ensureProject(absPath: string): ProjectPaths {
  const paths = projectPaths(absPath);
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.skillsDir, { recursive: true });
  mkdirSync(paths.plansDir, { recursive: true });

  const now = new Date().toISOString();
  let meta: ProjectMeta;
  if (existsSync(paths.metaFile)) {
    meta = JSON.parse(readFileSync(paths.metaFile, "utf-8"));
    meta.last_opened_at = now;
  } else {
    meta = {
      path: absPath,
      name: absPath.split("/").filter(Boolean).pop() ?? absPath,
      created_at: now,
      last_opened_at: now,
    };
  }
  writeFileSync(paths.metaFile, JSON.stringify(meta, null, 2));
  return paths;
}

/** Every project DevBuddy has ever been opened in, with its stored paths, for cross-project reporting. */
export function listAllProjects(): { meta: ProjectMeta; paths: ProjectPaths }[] {
  const projectsDir = join(DEVBUDDY_HOME, "projects");
  if (!existsSync(projectsDir)) return [];

  const results: { meta: ProjectMeta; paths: ProjectPaths }[] = [];
  for (const id of readdirSync(projectsDir)) {
    const metaFile = join(projectsDir, id, "meta.json");
    if (!existsSync(metaFile)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaFile, "utf-8")) as ProjectMeta;
      results.push({
        meta,
        paths: {
          root: join(projectsDir, id),
          metaFile,
          dbFile: join(projectsDir, id, "memory.db"),
          skillsDir: join(projectsDir, id, "skills"),
          plansDir: join(projectsDir, id, "plans"),
          notesFile: join(projectsDir, id, "memory.md"),
        },
      });
    } catch {
      continue; // corrupt meta.json - skip
    }
  }
  return results;
}

export function globalSkillsDir(): string {
  return join(DEVBUDDY_HOME, "skills");
}

export function connectorsFile(): string {
  return join(DEVBUDDY_HOME, "connectors", "connectors.json");
}

/**
 * The project-repo-local ".devbuddy/" directory (NOT ~/.devbuddy) - lives at
 * the project root next to package.json, meant to be committed to git so a
 * team shares the same skills/connectors/config instead of everyone
 * recreating them under their own home directory. Never holds secrets:
 * see repoConfigFile's key allowlist and the README written into it by
 * `devbuddy project init`.
 */
export function repoDevBuddyDir(projectRoot: string): string {
  return join(projectRoot, ".devbuddy");
}

export function repoSkillsDir(projectRoot: string): string {
  return join(repoDevBuddyDir(projectRoot), "skills");
}

export function repoConnectorsFile(projectRoot: string): string {
  return join(repoDevBuddyDir(projectRoot), "connectors.json");
}

export function repoConfigFile(projectRoot: string): string {
  return join(repoDevBuddyDir(projectRoot), "config.json");
}
