import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { globalSkillsDir } from "./project.js";

export interface Skill {
  name: string;
  description: string;
  content: string; // full instructions body, shown when the skill is loaded
  /** global: ~/.devbuddy/skills (this machine only). shared: the project's
   *  committed .devbuddy/skills (team-wide, via git). project: this user's
   *  own per-project skills, private and not committed. */
  source: "global" | "shared" | "project";
  filePath: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key) meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function loadSkillsFromDir(dir: string, source: Skill["source"]): Skill[] {
  if (!existsSync(dir)) return [];
  const skills: Skill[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const filePath = join(dir, file);
    const raw = readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const name = meta.name ?? file.replace(/\.md$/, "");
    skills.push({
      name,
      description: meta.description ?? "(no description)",
      content: body,
      source,
      filePath,
    });
  }
  return skills;
}

/**
 * Loads all skills visible to a project, layered from least to most
 * specific so a more specific skill overrides a same-named less specific
 * one: global (~/.devbuddy/skills, this machine only) < shared (the
 * project's committed .devbuddy/skills, team-wide via git) < project (this
 * user's own private per-project skills, never committed).
 */
export function loadSkills(projectSkillsDir: string, sharedSkillsDir?: string): Skill[] {
  const global = loadSkillsFromDir(globalSkillsDir(), "global");
  const shared = sharedSkillsDir ? loadSkillsFromDir(sharedSkillsDir, "shared") : [];
  const project = loadSkillsFromDir(projectSkillsDir, "project");

  const byName = new Map<string, Skill>();
  for (const skill of global) byName.set(skill.name, skill);
  for (const skill of shared) byName.set(skill.name, skill);
  for (const skill of project) byName.set(skill.name, skill);
  return [...byName.values()];
}

export function ensureGlobalSkillsDir(): string {
  const dir = globalSkillsDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
