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

## Data layout

```
~/.devbuddy/
├── config.json
├── skills/                  # global skills (planned)
├── connectors/               # MCP server registry (planned)
└── projects/
    └── <hash-of-project-path>/
        ├── meta.json
        ├── memory.db          # sessions + messages (SQLite)
        ├── skills/             # project-level skills (planned)
        └── plans/              # proposed plans, as markdown
```

## Roadmap

- Skills system (local markdown-based instruction bundles, global + per-project)
- MCP client support, so any MCP server (GitHub, filesystem, Slack, etc.)
  becomes available as tools
- Pluggable AI providers beyond Ollama (OpenAI, Anthropic, etc.) via
  user-supplied API keys
