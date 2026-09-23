import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { PROJECT_CONFIG_KEYS } from "../lib/config.js";
import { repoConnectorsFile, repoDevBuddyDir, repoSkillsDir } from "../lib/project.js";

const README = `# .devbuddy/

This directory is DevBuddy's **project-level, team-shared** configuration.
Commit it to git - everyone who checks out this repo and runs \`devbuddy\`
here gets the same skills, connectors, and defaults, instead of each person
recreating their own setup under their private ~/.devbuddy.

**Never put a secret in this directory.** It goes into git history, which
is forever and readable by everyone with repo access. API keys, license
keys, and endpoint URLs stay in your own ~/.devbuddy/config.json
(\`devbuddy provider set-key ...\`) and are never read from here.

## config.json

A JSON object with any of these keys - anything else is ignored:

${PROJECT_CONFIG_KEYS.map((k) => `- \`${k}\``).join("\n")}

These override the corresponding key in your own config when DevBuddy runs
in this project. Example:

\`\`\`json
{
  "provider": "anthropic",
  "model": "claude-sonnet-5",
  "verifyCommand": "npm test"
}
\`\`\`

## skills/

Markdown skill files (same format as \`devbuddy skills create\`), shared
with the whole team. Create one with:

\`\`\`
devbuddy skills create <name> --shared
\`\`\`

## connectors.json

MCP connectors shared with the team, in the same shape as
~/.devbuddy/connectors/connectors.json. Add one with:

\`\`\`
devbuddy connector add <name> --command "<cmd>" --shared
\`\`\`

If a connector needs credentials, reference an environment variable the
command itself expands (e.g. an env var already set in CI or each
developer's shell) - never write a literal key or token into this file.
`;

/** `projectRootOverride` exists only for tests, to avoid mutating the real
 *  process.cwd() (which node's test runner shares across concurrently
 *  running test files at the OS level, unlike JS module state). */
export function projectCommand(args: string[], projectRootOverride?: string): void {
  const [action] = args;
  const projectRoot = resolve(projectRootOverride ?? process.cwd());

  if (action !== "init") {
    console.error(chalk.red("Usage:\n  devbuddy project init"));
    process.exitCode = 1;
    return;
  }

  const dir = repoDevBuddyDir(projectRoot);
  const readmePath = `${dir}/README.md`;
  const connectorsPath = repoConnectorsFile(projectRoot);
  const skillsDir = repoSkillsDir(projectRoot);

  mkdirSync(skillsDir, { recursive: true });

  let createdReadme = false;
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, README);
    createdReadme = true;
  }
  if (!existsSync(connectorsPath)) {
    writeFileSync(connectorsPath, "[]\n");
  }

  console.log(chalk.green(`Set up ${dir}`));
  console.log(chalk.dim(`  ${dir}/README.md${createdReadme ? "" : " (already existed)"}`));
  console.log(chalk.dim(`  ${dir}/skills/`));
  console.log(chalk.dim(`  ${dir}/connectors.json`));
  console.log(
    chalk.yellow(
      `\nCommit this directory to git so your team shares it. Add project config with a` +
        ` ${chalk.cyan(`${dir}/config.json`)} file - see the README for allowed keys, and never put API keys or secrets in it.`
    )
  );
}
