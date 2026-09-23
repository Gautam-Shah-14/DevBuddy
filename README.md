<img src="assets/devbuddy-banner-dark.svg" alt="DevBuddy — local-first CLI developer agent, by TokenBurners">

# DevBuddy

DevBuddy is TokenBurners' local-first CLI developer agent. It defaults to
your own [Ollama](https://ollama.com) installation — no API keys, no cloud
calls, no per-token cost — and can optionally be pointed at OpenAI or any
OpenAI-compatible endpoint (OpenRouter, Together, a local llama.cpp server,
etc.) using your own API key. Ollama stays the default and always works
offline; switching providers is a config change, not a different tool.

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

Run the test suite (Node's built-in test runner via `tsx`, no extra test
framework dependency):

```
npm test
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
- `devbuddy provider list` — show configured providers and which is active.
- `devbuddy provider use <ollama|openai>` — switch the active provider.
- `devbuddy provider set-key openai <key>` — store an API key (config file
  is chmod 600; the key is masked whenever it's printed).
- `devbuddy provider set-url openai <url>` — point at a different
  OpenAI-compatible endpoint (default `https://api.openai.com/v1`).
- `devbuddy license status|set <key>|remove` — manage your Pro license.
- `devbuddy guardrails status|set <off|mask|block>` — manage PII/secret
  guardrails (Pro feature, see below).
- `devbuddy stats [--all]` — session/message/token counts for the current
  project, or every project with `--all`. Token counts are exact when the
  provider reports usage (Ollama always does; OpenAI-compatible endpoints
  usually do), and estimated from content length otherwise.

## Providers

DevBuddy talks to AI models through a small `ChatProvider` interface
(`src/providers/`), so the agent loop, tools, and memory never know which
backend is active:

- **ollama** (default) — local, no API key, talks to `http://localhost:11434`.
- **openai** — any OpenAI-compatible Chat Completions endpoint. Requires
  an API key (`devbuddy provider set-key openai <key>`).

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

## Guardrails

> **Status**: fully enabled for everyone during development/testing.
> The code below (Ed25519-signed license keys, `devbuddy license`) exists
> and works, but entitlement enforcement is currently switched off
> (`ENTITLEMENTS_ENFORCED = false` in `src/lib/license.ts`) because the
> real monetization model isn't decided yet - a purely offline license
> key can prove it was issued by TokenBurners, but it can't tie a
> purchase to a device/account, can't be revoked for a cancelled
> subscription, and the key file is just as shareable as any other text
> file. Solving that needs a real decision (accounts? periodic online
> activation? device binding?), not a bigger local file. Guardrails will
> move behind a real Pro gate once that's settled, before public launch.

DevBuddy can scan outgoing content for PII and secrets — emails, phone
numbers, SSNs, credit card numbers (Luhn-validated), IP addresses, street
addresses, **Aadhaar numbers (Verhoeff checksum-validated)**, **PAN
numbers (holder-type validated)**, **GSTINs (mod-36 checksum-validated,
same algorithm GSTN uses)**, AWS access keys, private key blocks,
JWTs, and generic `key: value` / `token: value` secrets — right at the
boundary where content is about to leave your machine in a request to
the AI provider. Local tools are never restricted: the agent can still
freely read and edit files containing PII. The guardrail only guards
what gets sent out.

Aadhaar and PAN detection use the same structural checks India's own
systems use to validate them (not just "looks like the right shape"),
so a random 12-digit number won't be mistaken for an Aadhaar number and
vice versa. When two detectors' shapes overlap (e.g. a 12-digit number
also fits a loose phone-number pattern), the validated, higher-confidence
match always wins.

Two modes:

- **mask** — matches are replaced with stable placeholders (`⟦EMAIL_1⟧`,
  `⟦AWS_ACCESS_KEY_1⟧`, ...) before the request is sent. The same real
  value always maps to the same placeholder for the session. Placeholders
  in the model's reply are substituted back with the real values before
  you see them — the AI provider never sees the raw value, but the reply
  reads naturally.
- **block** — a turn whose outgoing content contains PII/secrets is
  refused entirely. Nothing is sent to the AI provider; DevBuddy reports
  which type it found.

Detection is 100% local (plain regex + a Luhn checksum for card numbers,
no ML model, no network call) — see `src/lib/guardrails/`.

```
devbuddy license set <key>       # unlock Pro
devbuddy guardrails set mask     # or: block
```

Without a Pro license, guardrails mode falls back to `off` even if it was
previously set (e.g. after a license expires). Licenses are signed
Ed25519 keys verified entirely offline — DevBuddy never phones home to
check one.

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

- Additional providers (Anthropic, Gemini, etc.) behind the same
  `ChatProvider` interface
