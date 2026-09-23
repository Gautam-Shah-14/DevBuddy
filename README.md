# DevBuddy

DevBuddy is TokenBurners' local-first CLI developer agent. It runs entirely
against your own [Ollama](https://ollama.com) installation — no API keys, no
cloud calls, no per-token cost. Future versions will let you plug in other
AI providers via your own API key, but the local Ollama path is the
foundation and always works offline.

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) installed and running (`ollama serve`)
- A model pulled locally — coder-focused models give the best results for
  tool use, e.g.:
  ```
  ollama pull qwen2.5-coder
  ```

## Development

```
npm install
npm run dev -- chat        # run directly with tsx, no build step
```

or build once and run the compiled CLI:

```
npm run build
node dist/cli.js chat
```

## Commands

- `devbuddy chat` — start an interactive agent session in the current
  directory (this is the project DevBuddy operates on).
- `devbuddy models` — list Ollama models installed locally.
- `devbuddy config` — view current configuration.
- `devbuddy config set <key> <value>` — set `host`, `model`, or
  `systemPrompt`.
- `devbuddy skills` — list available skills.
- `devbuddy skills create <name> [--project]` — scaffold a new skill
  (global by default, or project-local with `--project`).
- `devbuddy connector list` — list configured MCP connectors.
- `devbuddy connector add <name> --command "<cmd>" [--args "a b c"] [--env KEY=VALUE]`
  — register an MCP server, e.g.:
  ```
  devbuddy connector add filesystem --command "npx" --args "-y @modelcontextprotocol/server-filesystem /path/to/project"
  ```
- `devbuddy connector enable|disable|remove <name>` — manage connectors.

## How it works

- **Agent loop**: each turn, the model can call built-in tools (read/write/
  edit/delete files, run shell commands, git status/diff/commit/push,
  search files, propose a plan) via Ollama's native tool-calling API. Models
  without tool-calling support fall back to a structured text protocol the
  agent also understands.
- **Sandboxing**: all file and shell tools are confined to the current
  project directory — DevBuddy cannot read, write, or execute outside it.
- **Permissions**: risky actions (writing/deleting files, running shell
  commands, git push) prompt for approval before running. You can approve
  a category for the rest of the session, except deletes and pushes, which
  always ask.
- **Plan mode**: for larger tasks, the agent writes a plan to
  `~/.devbuddy/projects/<id>/plans/` and pauses for your approval before
  touching anything.
- **Local memory**: conversation history is stored per-project in a plain
  SQLite database under `~/.devbuddy/projects/<id>/memory.db`, keyed by a
  hash of the project's absolute path. Nothing leaves your machine.
- **Skills**: markdown files with a small frontmatter header (`name`,
  `description`) under `~/.devbuddy/skills/` (global) or a project's
  `skills/` directory (project-local, overrides a global skill of the same
  name). The agent sees the list of available skills in its system prompt
  and calls `use_skill` to load one's full instructions on demand.
- **Connectors (MCP client)**: DevBuddy connects to any MCP server
  registered in `~/.devbuddy/connectors/connectors.json` and exposes its
  tools to the agent, namespaced as `mcp__<connector>__<tool>`. Calling an
  MCP tool goes through the same permission system as built-in tools.

## Data layout

```
~/.devbuddy/
├── config.json
├── skills/                  # global skills
├── connectors/
│   └── connectors.json      # MCP server registry
└── projects/
    └── <hash-of-project-path>/
        ├── meta.json
        ├── memory.db          # sessions + messages (SQLite)
        ├── skills/             # project-level skills
        └── plans/              # proposed plans, as markdown
```

## Roadmap

- Pluggable AI providers beyond Ollama (OpenAI, Anthropic, etc.) via
  user-supplied API keys
