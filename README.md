<img src="assets/devbuddy-banner-dark.svg" alt="DevBuddy — local-first CLI developer agent, by TokenBurners">

[![CI](https://github.com/Gautam-Shah-14/DevBuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/Gautam-Shah-14/DevBuddy/actions/workflows/ci.yml)

# DevBuddy

DevBuddy is TokenBurners' local-first CLI developer agent. It defaults to
your own [Ollama](https://ollama.com) installation — no API keys, no cloud
calls, no per-token cost — and can optionally be pointed at OpenAI (or any
OpenAI-compatible endpoint: OpenRouter, Together, a local llama.cpp server,
etc.) or Anthropic/Claude, each using your own API key. Ollama stays the
default and always works offline; switching providers is a config change,
not a different tool.

Providers are added via metered API keys only — not by logging into an
existing Claude Pro/Max or ChatGPT Plus/Pro web subscription. Reusing a
consumer subscription's session inside a third-party CLI isn't a supported
integration path for either vendor and risks the account being flagged; API
keys are the sanctioned way to bring your own account's usage to a tool
like this.

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) installed and running (`ollama serve`)
- A model pulled locally — coder-focused models give the best results for
  tool use, e.g.:
  ```
  ollama pull qwen2.5-coder
  ```

## Install

Not yet published. Once it is, it'll be:

```
npm install -g @tokenburners/devbuddy
devbuddy chat
```

(the package is scoped as `@tokenburners/devbuddy` since the unscoped name
`devbuddy` is already taken on npm by an unrelated project; the CLI command
is still just `devbuddy`). Until then, see Development below to run it from
source.

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

CI (`.github/workflows/ci.yml`) runs the build, test suite, and a
cross-platform smoke test of `run_shell`/`search_files` on real Linux,
Windows, and macOS GitHub Actions runners on every push - this is what
actually verifies Windows support, not just code review, since none of
this development happens on a Windows machine directly.

## Commands

- `devbuddy chat` — start a new interactive agent session in the current
  directory (this is the project DevBuddy operates on).
- `devbuddy -c` / `devbuddy chat -c` — continue the most recently used
  session in this project, right where it left off (its full transcript is
  loaded back in as prior context).
- `devbuddy -r` / `devbuddy chat -r` — pick a session to resume from a
  list of recent ones in this project.
- `devbuddy -r <session-id>` / `devbuddy chat -r <session-id>` — resume
  that specific session directly (see `devbuddy history list` for ids).
- `devbuddy run "<prompt>" [--yes] [--model <model>] [--json]` — run a
  single non-interactive agent turn and exit, for scripts/CI/pre-commit
  hooks. Read-only tasks work with no flags; anything that writes, deletes,
  runs a shell command, or pushes requires `--yes` to auto-approve (there's
  no one to prompt), and is otherwise refused with an explanation. `--json`
  prints `{ sessionId, model, provider, content }` instead of streaming
  plain text, for piping into other tools.
- `devbuddy models` — list Ollama models installed locally.
- `devbuddy config` — view current configuration.
- `devbuddy config set <key> <value>` — set `host`, `model`,
  `systemPrompt`, `verifyCommand` (see Self-verification below), or
  `compactThreshold` (see Context compaction below).
- `devbuddy skills` — list available skills.
- `devbuddy skills create <name> [--project|--shared]` — scaffold a new
  skill: global by default, private to this project with `--project`, or
  team-shared (written to `.devbuddy/skills/`, commit it) with `--shared`.
- `devbuddy connector list` — list configured MCP connectors.
- `devbuddy connector add <name> --command "<cmd>" [--args "a b c"] [--env KEY=VALUE] [--shared]`
  — register an MCP server, e.g.:
  ```
  devbuddy connector add filesystem --command "npx" --args "-y @modelcontextprotocol/server-filesystem /path/to/project"
  ```
  `--shared` writes it to the project's committed `.devbuddy/connectors.json`
  instead of your own `~/.devbuddy` — see Team-shared project config below.
- `devbuddy connector enable|disable|remove <name>` — manage connectors.
- `devbuddy project init` — scaffold this project's team-shared
  `.devbuddy/` directory (see Team-shared project config below).
- `devbuddy provider list` — show configured providers and which is active.
- `devbuddy provider use <ollama|openai|anthropic>` — switch the active
  provider.
- `devbuddy provider set-key <openai|anthropic> <key>` — store an API key
  (config file is chmod 600; the key is masked whenever it's printed).
- `devbuddy provider set-url <openai|anthropic> <url>` — point at a
  different endpoint (defaults: `https://api.openai.com/v1`,
  `https://api.anthropic.com/v1`).
- `devbuddy license status|set <key>|remove` — manage your Pro license.
- `devbuddy guardrails status|set <off|mask|block>` — manage PII/secret
  guardrails (Pro feature, see below).
- `devbuddy stats [--all]` — session/message/token counts for the current
  project, or every project with `--all`. Token counts are exact when the
  provider reports usage (Ollama always does; OpenAI-compatible endpoints
  usually do), and estimated from content length otherwise. Also breaks
  down tool calls (pass/fail per tool), skills loaded, and MCP connectors
  used, so you can see what actually happened across your sessions here.
- `devbuddy history [list]` — recent sessions in the current project (id,
  time range, provider/model, message count, first message).
- `devbuddy history show <session-id>` — full transcript of one session,
  with a summary of that session's tool calls (pass/fail per tool), skills
  loaded, and connectors used above it.
- `devbuddy history search <text> [--all]` — search message content in
  the current project, or every project with `--all`.
- `devbuddy doctor` — one-command environment check: Node version, config
  file, `~/.devbuddy` write access and free disk space, git, ripgrep/grep
  availability, connectivity for all three providers, and license/plan
  status. Exits non-zero if anything critical is broken.
- `devbuddy undo` — revert the agent's most recent file change (write,
  edit, or delete) in the current project. Run it again to keep walking
  back further changes.
- `devbuddy undo list [n]` — show the last `n` (default 20) recorded file
  changes, newest first, with which have already been reverted.

## Providers

DevBuddy talks to AI models through a small `ChatProvider` interface
(`src/providers/`), so the agent loop, tools, and memory never know which
backend is active:

- **ollama** (default) — local, no API key, talks to `http://localhost:11434`.
- **openai** — any OpenAI-compatible Chat Completions endpoint. Requires
  an API key (`devbuddy provider set-key openai <key>`).
- **anthropic** — Claude, via Anthropic's Messages API. Requires an API key
  (`devbuddy provider set-key anthropic <key>`), from
  [console.anthropic.com](https://console.anthropic.com). Set a Claude model
  with `devbuddy config set model claude-sonnet-5` (or `claude-opus-5`,
  `claude-haiku-4-5`, etc.) after switching.

Example setup for Claude:

```
devbuddy provider set-key anthropic sk-ant-...
devbuddy provider use anthropic
devbuddy config set model claude-sonnet-5
devbuddy chat
```

All three providers automatically retry a request with exponential backoff
(plus jitter, honoring a `Retry-After` header when the API sends one) on a
network error or an HTTP 429/5xx - up to 2 retries before giving up. A
client error (bad API key, malformed request, 404, etc.) is never
retried - retrying a permanent problem just delays the real error message.
Retries only ever happen before any part of the reply has streamed back,
so you never see duplicated or truncated output from a mid-stream retry.

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
  always ask. `devbuddy run` has no one to prompt, so it refuses risky
  actions by default and only auto-approves them with `--yes`.
- **Diff preview**: the write/edit/delete permission prompt shows a colored,
  `git diff`-style preview of the exact change (with a couple of lines of
  context around each hunk) before you approve it — you see what's about to
  happen, not just a file path.
- **Self-verification**: after a turn where the agent edited or deleted
  files, DevBuddy automatically runs a verification command and, if it
  fails, feeds the failure straight back to the model to fix (up to 2
  retries per turn, so it can't loop forever). By default this auto-detects
  `npm test` when the project's `package.json` has a real test script;
  override it with `devbuddy config set verifyCommand "npm run build"`, or
  turn it off entirely with `devbuddy config set verifyCommand off`.
- **Undo**: every write/edit/delete records the file's content just before
  the change (or that it didn't exist yet, for a new file) in the project's
  memory database. `devbuddy undo` reverts the most recent one and can be
  run repeatedly to keep walking back further; `devbuddy undo list` shows
  the recorded history. This is a per-project change log, not a git
  operation, so it works even outside a git repo.
- **Plan mode**: for larger tasks, the agent writes a plan to
  `~/.devbuddy/projects/<id>/plans/` and pauses for your approval before
  touching anything.
- **Local memory**: conversation history is stored per-project in a plain
  SQLite database under `~/.devbuddy/projects/<id>/memory.db`, keyed by a
  hash of the project's absolute path. Nothing leaves your machine. Beyond
  the raw prompt/response transcript, every tool call is recorded too -
  which tool, its arguments, whether it succeeded or failed, and (for
  `use_skill` and MCP connector calls) which skill or connector - so
  `devbuddy stats` and `devbuddy history show` can tell you what actually
  happened in a session, not just what was said, which is especially
  useful when picking a project back up later.
- **Session resume**: `devbuddy chat` always starts a fresh session, but
  `-c`/`--continue` and `-r`/`--resume` reopen a past one instead - its
  full transcript (as plain messages, so it's always safe to hand to any
  provider) is loaded back in before your next message, and everything
  from there on is appended to that same session rather than starting a
  new one, so `devbuddy history show <id>` keeps showing one continuous
  conversation.
- **Context compaction**: a long `chat` session (especially a resumed one)
  can outgrow a model's context window. Once the conversation's estimated
  token count passes `compactThreshold` (default 6000 - conservative for
  small local models; raise it for a big-context cloud model), DevBuddy
  asks the model to summarize everything except the most recent messages
  into one summary message, and continues from there - the full raw
  history is never lost (`devbuddy history show` still shows everything),
  only the *live* conversation and future resumes start from the summary
  forward. Trigger it manually anytime with `/compact` in the REPL, or
  disable auto-compaction with `devbuddy config set compactThreshold off`.
- **Skills**: markdown files with a small frontmatter header (`name`,
  `description`), loaded from three places from least to most specific -
  `~/.devbuddy/skills/` (global, this machine only), a project's committed
  `.devbuddy/skills/` (shared with your team via git), and a project's
  private `skills/` directory (this user only) - a more specific skill
  overrides a same-named less specific one. The agent sees the list of
  available skills in its system prompt and calls `use_skill` to load one's
  full instructions on demand.
- **Connectors (MCP client)**: DevBuddy connects to any MCP server
  registered in `~/.devbuddy/connectors/connectors.json` (yours) or a
  project's committed `.devbuddy/connectors.json` (shared, overrides a
  same-named one of yours) and exposes its tools to the agent, namespaced
  as `mcp__<connector>__<tool>`. Calling an MCP tool goes through the same
  permission system as built-in tools.

## Team-shared project config

Everything above defaults to living under your own `~/.devbuddy`, private
to your machine. Run `devbuddy project init` in a repo to also set up a
**project-local `.devbuddy/` directory that's meant to be committed to
git**, so everyone who checks out the repo gets the same setup instead of
each person reconfiguring DevBuddy from scratch:

```
devbuddy project init
```

This creates:

- `.devbuddy/config.json` — non-secret defaults layered on top of your own
  config when DevBuddy runs in this project: `provider`, `model`,
  `systemPrompt`, `verifyCommand`, `guardrailsMode`, `compactThreshold`.
  `devbuddy config` shows you when a value is overridden this way.
- `.devbuddy/skills/` — skills shared with the team (`devbuddy skills
  create <name> --shared`).
- `.devbuddy/connectors.json` — MCP connectors shared with the team
  (`devbuddy connector add <name> --command "..." --shared`).

**This directory never holds secrets.** API keys, license keys, and
endpoint URLs always come from your own `~/.devbuddy/config.json` - the
allowlist of keys `.devbuddy/config.json` can override doesn't include any
of them, and a connector needing credentials should reference an
environment variable rather than embed one. It's git-committed content, so
treat it the same as any other file in the repo: reviewed on PRs, visible
to everyone with repo access, and permanent in history.

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
~/.devbuddy/                   # yours, private to this machine
├── config.json
├── skills/                    # global skills
├── connectors/
│   └── connectors.json        # your MCP server registry
└── projects/
    └── <hash-of-project-path>/
        ├── meta.json
        ├── memory.db          # sessions + messages + tool call history + undo checkpoints (SQLite)
        ├── skills/             # your private per-project skills
        └── plans/              # proposed plans, as markdown

<project-repo>/.devbuddy/      # committed to git, shared with your team
├── config.json                 # non-secret overrides (see Team-shared project config)
├── skills/                     # skills shared with the team
└── connectors.json             # MCP connectors shared with the team
```

## Roadmap

- Additional providers (Gemini, Bedrock, etc.) behind the same
  `ChatProvider` interface
- Auto-detect project context (language, test runner, lint config) to seed
  memory/system prompt automatically, instead of starting cold each session
- Cost/budget guard — a per-session token or dollar cap for paid providers

## License

Copyright (c) TokenBurners. All rights reserved — see [LICENSE](LICENSE).
This is proprietary software: the source is visible on GitHub, but no
license is granted to use, copy, modify, or redistribute it beyond what
TokenBurners separately permits for a published build.
