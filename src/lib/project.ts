import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export function globalSkillsDir(): string {
  return join(DEVBUDDY_HOME, "skills");
}

export function connectorsFile(): string {
  return join(DEVBUDDY_HOME, "connectors", "connectors.json");
}
