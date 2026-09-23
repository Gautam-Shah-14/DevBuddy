import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { ensureGlobalSkillsDir, loadSkills } from "../lib/skills.js";
import { ensureProject } from "../lib/project.js";

export function skillsCommand(args: string[]): void {
  const projectRoot = resolve(process.cwd());
  const paths = ensureProject(projectRoot);

  if (args[0] === "create") {
    const name = args[1];
    if (!name) {
      console.error(chalk.red("Usage: devbuddy skills create <name> [--project]"));
      process.exitCode = 1;
      return;
    }
    const isProject = args.includes("--project");
    const dir = isProject ? paths.skillsDir : ensureGlobalSkillsDir();
    const filePath = join(dir, `${name}.md`);
    if (existsSync(filePath)) {
      console.error(chalk.red(`Skill already exists: ${filePath}`));
      process.exitCode = 1;
      return;
    }
    writeFileSync(
      filePath,
      `---\nname: ${name}\ndescription: TODO describe when this skill should be used\n---\n\nTODO: write the skill's instructions here.\n`
    );
    console.log(chalk.green(`Created skill at ${filePath}`));
    return;
  }

  const skills = loadSkills(paths.skillsDir);
  if (skills.length === 0) {
    console.log(chalk.yellow("No skills found."));
    console.log(`Create one with: ${chalk.cyan("devbuddy skills create <name>")}`);
    return;
  }

  console.log(chalk.bold("Available skills:\n"));
  for (const skill of skills) {
    console.log(`  ${chalk.cyan(skill.name)} ${chalk.dim(`(${skill.source})`)} — ${skill.description}`);
  }
}
