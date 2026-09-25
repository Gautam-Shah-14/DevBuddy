<p align="center">
  <img src="assets/devbuddy-banner-dark.svg" alt="DevBuddy — local-first CLI developer agent, by TokenBurners">
</p>

<p align="center">
  <a href="https://github.com/Gautam-Shah-14/DevBuddy/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Gautam-Shah-14/DevBuddy/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/Gautam-Shah-14/DevBuddy/blob/main/package.json"><img alt="Version" src="https://img.shields.io/github/package-json/v/Gautam-Shah-14/DevBuddy"></a>
  <img alt="Node.js 18+" src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/built%20with-TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-proprietary-lightgrey">
  <img alt="Platforms" src="https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-informational">
  <a href="https://github.com/Gautam-Shah-14/DevBuddy/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/Gautam-Shah-14/DevBuddy"></a>
  <a href="https://github.com/Gautam-Shah-14/DevBuddy/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/Gautam-Shah-14/DevBuddy"></a>
</p>

<p align="center">
  A local-first CLI developer agent. Runs on your own <a href="https://ollama.com">Ollama</a>
  installation by default — no API keys, no cloud calls, no per-token cost —
  and switches to OpenAI or Anthropic/Claude with a one-line config change
  when you want a hosted model instead.
</p>

<p align="center"><sub>by <b>TokenBurners</b></sub></p>

---

## Contents

- [Why DevBuddy](#why-devbuddy)
- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Providers](#providers)
- [How it works](#how-it-works)
- [Team-shared project config](#team-shared-project-config)
- [Guardrails](#guardrails)
- [Data layout](#data-layout)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

## Why DevBuddy

| | |
|---|---|
| **Local-first** | Defaults to your own Ollama install. Nothing leaves your machine unless you explicitly switch to a hosted provider. |
| **Bring your own key** | OpenAI, any OpenAI-compatible endpoint, or Anthropic/Claude — your API key, metered usage, no subscription reuse. |
| **Sandboxed by design** | File and shell tools are confined to the current project directory; risky actions ask for approval and show a diff before they run. |
| **Self-correcting** | Runs your test suite after an edit and feeds a failure straight back to the model to fix, up to a couple of retries. |
| **Undo-able** | Every write/edit/delete is checkpointed. `devbuddy undo` reverts the agent's last change, repeatedly if needed. |
| **Resumable** | `devbuddy -c` / `-r` reopen a past session with its full history, and long conversations auto-compact to stay in context. |
| **Team-shareable** | `devbuddy project init` sets up a committed `.devbuddy/` with shared skills, connectors, and non-secret config for the whole team. |
| **Extensible** | Markdown skills, MCP connectors, and pluggable AI providers behind one small interface. |

## Requirements

- Node.js 18+
- [Ollama](https://ollama.com) installed and running (`ollama serve`) — only needed if you're using the default local provider
- A model pulled locally — coder-focused models give the best results for tool use:
  ```sh
  ollama pull qwen2.5-coder
  ```

## Install

Not yet published. Once it is:

```sh
npm install -g @tokenburners/devbuddy
devbuddy
```

The package is scoped as `@tokenburners/devbuddy` (the unscoped name
`devbuddy` is already taken on npm by an unrelated project) — the CLI
command itself is still just `devbuddy`. Until it's published, see
[Development](#development) to run it from source.

## Quick start

```sh
devbuddy doctor        # sanity-check your setup (Node, Ollama, git, disk space)
devbuddy               # start talking to your codebase
```

Want a hosted model instead of local Ollama?

```sh
devbuddy provider set-key anthropic sk-ant-...
devbuddy provider use anthropic
devbuddy config set model claude-sonnet-5
devbuddy
```

## Commands

### Chat & sessions

| Command | Description |
|---|---|
| `devbuddy` | Start a new interactive agent session in the current project. |
| `devbuddy -c` | Continue the most recently used session in this project. |
| `devbuddy -r` | Pick a session to resume from a list of recent ones. |
| `devbuddy -r <id>` | Resume that specific session directly (see `history list` for ids). |
| `/compact` *(inside chat)* | Summarize older history now, instead of waiting for auto-compaction. |
| `/retry` *(inside chat)* | Re-send your last message as a new turn (e.g. after a bad or cut-off reply). Doesn't erase the previous attempt from history, it just asks again. |
| `devbuddy run "<prompt>" [--yes] [--model <m>] [--json]` | One-shot, non-interactive agent turn for scripts/CI/pre-commit hooks. Read-only tasks need no flags; anything that writes, deletes, runs a shell command, or pushes needs `--yes` to auto-approve. `--json` prints `{ sessionId, model, provider, content }` for piping into other tools. |

### Providers & models

| Command | Description |
|---|---|
| `devbuddy models` | List Ollama models installed locally. |
| `devbuddy provider list` | Show configured providers and which is active. |
| `devbuddy provider use <ollama\|openai\|anthropic>` | Switch the active provider. |
| `devbuddy provider set-key <openai\|anthropic> <key>` | Store an API key (config file is chmod 600; masked when printed). |
| `devbuddy provider set-url <openai\|anthropic> <url>` | Point at a different endpoint (e.g. OpenRouter, a local llama.cpp server). |
| `devbuddy config` | View current configuration. |
| `devbuddy config set <key> <value>` | Set `host`, `model`, `systemPrompt`, `verifyCommand`, `compactThreshold`, or `contextWindow`. |

### Project & team

| Command | Description |
|---|---|
| `devbuddy project init` | Scaffold this project's team-shared `.devbuddy/` directory. |
| `devbuddy skills` | List available skills. |
| `devbuddy skills create <name> [--project\|--shared]` | Scaffold a skill: global by default, private with `--project`, team-shared with `--shared`. |
| `devbuddy connector list` | List configured MCP connectors. |
| `devbuddy connector add <name> --command "<cmd>" [--args "..."] [--env K=V] [--shared]` | Register an MCP server. |
| `devbuddy connector enable\|disable\|remove <name>` | Manage connectors. |

### History & data

| Command | Description |
|---|---|
| `devbuddy stats [--all]` | Session/message/token counts, plus a tool-call/skill/connector breakdown, for this project (or every project with `--all`). |
| `devbuddy history [list]` | Recent sessions in the current project. |
| `devbuddy history show <id>` | Full transcript of one session, with its tool-call/skill/connector summary. |
| `devbuddy history search <text> [--all]` | Search message content in this project, or every project. |
| `devbuddy undo` | Revert the agent's most recent file change. Repeatable to walk further back. |
| `devbuddy undo list [n]` | Show the last `n` recorded file changes. |

### Utilities & account

| Command | Description |
|---|---|
| `devbuddy doctor` | One-command environment check (Node, providers, git, disk space, license). Exits non-zero if something's broken. |
| `devbuddy license status\|set <key>\|remove` | Manage your Pro license. |
| `devbuddy guardrails status\|set <off\|mask\|block>` | Manage PII/secret guardrails ([Pro feature](#guardrails)). |

<details>
<summary>Example: registering an MCP connector</summary>

```sh
devbuddy connector add filesystem \
  --command "npx" \
  --args "-y @modelcontextprotocol/server-filesystem /path/to/project"
```

</details>

## Providers

DevBuddy talks to AI models through a small `ChatProvider` interface
(`src/providers/`), so the agent loop, tools, and memory never know which
backend is active.

| Provider | Notes |
|---|---|
| **ollama** *(default)* | Local, no API key. Talks to `http://127.0.0.1:11434`. |
| **openai** | Any OpenAI-compatible Chat Completions endpoint (OpenAI, OpenRouter, Together, a local llama.cpp server). Requires an API key. |
| **anthropic** | Claude, via Anthropic's Messages API. Requires an API key from [console.anthropic.com](https://console.anthropic.com). |

Providers are added via **metered API keys only** — not by logging into an
existing Claude Pro/Max or ChatGPT Plus/Pro web subscription. Reusing a
consumer subscription's session inside a third-party CLI isn't a supported
integration path for either vendor and risks the account being flagged;
API keys are the sanctioned way to bring your own account's usage here.

All three providers automatically retry a request with exponential
backoff (plus jitter, honoring a `Retry-After` header when the API sends
one) on a network error or an HTTP 429/5xx — up to 2 retries before
giving up. A client error (bad API key, malformed request, 404, etc.) is
never retried, and retries only ever happen before any part of the reply
has streamed back, so you never see duplicated or truncated output.

## How it works

<details open>
<summary><b>Agent loop &amp; safety</b></summary>

- **Agent loop** — each turn, the model can call built-in tools (read/write/
  edit/delete files, run shell commands, git status/diff/commit/push,
  search files, propose a plan) via native tool-calling. Models without
  tool-calling support fall back to a structured text protocol the agent
  also understands.
- **Sandboxing** — all file and shell tools are confined to the current
  project directory; DevBuddy cannot read, write, or execute outside it.
- **Permissions** — risky actions (writing/deleting files, running shell
  commands, git push) prompt for approval before running. Approve a
  category for the rest of the session, except deletes and pushes, which
  always ask. `devbuddy run` has no one to prompt, so it refuses risky
  actions by default and only auto-approves them with `--yes`.
- **Diff preview** — the write/edit/delete permission prompt shows a
  colored, `git diff`-style preview of the exact change before you
  approve it, not just a file path.
- **Self-verification** — after a turn that edited or deleted files,
  DevBuddy runs a verification command and, on failure, feeds it straight
  back to the model to fix (up to 2 retries, so it can't loop forever).
  Auto-detects `npm test` by default; override with
  `devbuddy config set verifyCommand "npm run build"`, or disable with
  `verifyCommand off`.
- **Undo** — every write/edit/delete is checkpointed in the project's
  memory database before it happens. `devbuddy undo` reverts the most
  recent change and can be run repeatedly to walk further back. This is a
  per-project change log, independent of git — it works even outside a
  git repo.
- **Plan mode** — for larger tasks, the agent writes a plan to
  `~/.devbuddy/projects/<id>/plans/` and pauses for approval before
  touching anything.

</details>

<details>
<summary><b>Memory, sessions &amp; context</b></summary>

- **Local memory** — conversation history lives per-project in a plain
  SQLite database (`~/.devbuddy/projects/<id>/memory.db`). Nothing leaves
  your machine. Beyond the raw transcript, every tool call is recorded —
  which tool, its arguments, pass/fail, and (for skills/connectors) which
  one — so `devbuddy stats`/`history show` can tell you what actually
  happened in a session, useful when picking a project back up later.
- **Session resume** — plain `devbuddy` starts fresh by default, but
  `-c`/`--continue` and `-r`/`--resume` reopen a past session with its
  full transcript loaded back in, appending to that same session rather
  than starting a new one, so `history show <id>` keeps showing one
  continuous conversation.
- **Context compaction** — a long or resumed session can outgrow a
  model's context window. Once the estimated token count passes
  `compactThreshold` (default `11000`), DevBuddy asks the model to
  summarize everything but the most recent messages into one summary
  message and continues from there. The full raw history is never lost
  (`history show` still shows everything); only the live conversation and
  future resumes start from the summary forward. Trigger it manually with
  `/compact`, or disable with `devbuddy config set compactThreshold off`.
  For Ollama, this is paired with `contextWindow` (default `16384`,
  passed to Ollama as `num_ctx`) — Ollama otherwise falls back to its own
  small built-in context window (often 2048-4096 tokens) and silently
  truncates older messages once that's exceeded, which looks like
  DevBuddy compacting far too often, or the model losing track of things
  it was just told, when the real cause is that default never having
  been raised. If your model supports a larger context and your machine
  has the RAM/VRAM for it (qwen3, for example, supports well beyond
  32k), raise both together, e.g.
  `devbuddy config set contextWindow 32768` and
  `devbuddy config set compactThreshold 24000`, keeping
  `compactThreshold` comfortably below `contextWindow` to leave room for
  the system prompt, tool schemas, and the model's own response.

</details>

<details>
<summary><b>Skills &amp; connectors</b></summary>

- **Skills** — markdown files with a small frontmatter header (`name`,
  `description`), loaded from three places, least to most specific:
  `~/.devbuddy/skills/` (global), a project's committed `.devbuddy/skills/`
  (team-shared via git), and a project's private `skills/` directory
  (this user only) — a more specific skill overrides a same-named less
  specific one. The agent sees the available skills in its system prompt
  and calls `use_skill` to load one's full instructions on demand.
- **Connectors (MCP client)** — DevBuddy connects to any MCP server
  registered in `~/.devbuddy/connectors/connectors.json` (yours) or a
  project's committed `.devbuddy/connectors.json` (shared, overrides a
  same-named one of yours), exposing its tools to the agent as
  `mcp__<connector>__<tool>` — routed through the same permission system
  as built-in tools.

</details>

## Team-shared project config

Everything above defaults to living under your own `~/.devbuddy`, private
to your machine. Run `devbuddy project init` in a repo to also set up a
**project-local `.devbuddy/` directory meant to be committed to git**, so
everyone who checks out the repo gets the same setup instead of each
person reconfiguring DevBuddy from scratch:

```sh
devbuddy project init
```

This creates:

| Path | Purpose |
|---|---|
| `.devbuddy/config.json` | Non-secret defaults layered on top of your own config: `provider`, `model`, `systemPrompt`, `verifyCommand`, `guardrailsMode`, `compactThreshold`, `contextWindow`. `devbuddy config` shows when a value is overridden this way. |
| `.devbuddy/skills/` | Skills shared with the team (`devbuddy skills create <name> --shared`). |
| `.devbuddy/connectors.json` | MCP connectors shared with the team (`devbuddy connector add <name> --command "..." --shared`). |

> **This directory never holds secrets.** API keys, license keys, and
> endpoint URLs always come from your own `~/.devbuddy/config.json` — the
> allowlist of keys `.devbuddy/config.json` can override doesn't include
> any of them, and a connector needing credentials should reference an
> environment variable rather than embed one. It's git-committed content:
> reviewed on PRs, visible to everyone with repo access, permanent in
> history.

## Guardrails

> **Status: fully enabled for everyone during development/testing.**
> The code below (Ed25519-signed license keys, `devbuddy license`) exists
> and works, but entitlement enforcement is currently switched off
> (`ENTITLEMENTS_ENFORCED = false` in `src/lib/license.ts`) because the
> real monetization model isn't decided yet — a purely offline license
> key can prove it was issued by TokenBurners, but it can't tie a
> purchase to a device/account, can't be revoked for a cancelled
> subscription, and the key file is as shareable as any other text file.
> Guardrails move behind a real Pro gate once that's settled, before
> public launch.

DevBuddy can scan outgoing content for PII and secrets — emails, phone
numbers, SSNs, credit card numbers (Luhn-validated), IP addresses, street
addresses, **Aadhaar numbers** (Verhoeff checksum-validated), **PAN
numbers** (holder-type validated), **GSTINs** (mod-36 checksum-validated,
same algorithm GSTN uses), AWS access keys, private key blocks, JWTs, and
generic `key: value` / `token: value` secrets — right at the boundary
where content is about to leave your machine. Local tools are never
restricted: the agent can still freely read and edit files containing
PII. The guardrail only guards what gets sent out.

Aadhaar and PAN detection use the same structural checks India's own
systems use to validate them, so a random 12-digit number won't be
mistaken for an Aadhaar number and vice versa; when detectors' shapes
overlap, the validated, higher-confidence match always wins.

| Mode | Behavior |
|---|---|
| `mask` | Matches are replaced with stable placeholders (`⟦EMAIL_1⟧`, ...) before the request is sent. The same real value always maps to the same placeholder; placeholders in the reply are substituted back before you see them. |
| `block` | A turn whose outgoing content contains PII/secrets is refused entirely. Nothing is sent; DevBuddy reports what it found. |

Detection is 100% local (plain regex + a Luhn checksum for card numbers,
no ML model, no network call) — see `src/lib/guardrails/`.

```sh
devbuddy license set <key>       # unlock Pro
devbuddy guardrails set mask     # or: block
```

Without a Pro license, guardrails mode falls back to `off` even if it was
previously set (e.g. after a license expires). Licenses are signed
Ed25519 keys verified entirely offline — DevBuddy never phones home to
check one.

## Data layout

```
~/.devbuddy/                     # yours, private to this machine
├── config.json
├── skills/                      # global skills
├── connectors/
│   └── connectors.json          # your MCP server registry
└── projects/
    └── <hash-of-project-path>/
        ├── meta.json
        ├── memory.db            # sessions, messages, tool history, undo checkpoints (SQLite)
        ├── skills/               # your private per-project skills
        └── plans/                # proposed plans, as markdown

<project-repo>/.devbuddy/        # committed to git, shared with your team
├── config.json                   # non-secret overrides
├── skills/                       # skills shared with the team
└── connectors.json               # MCP connectors shared with the team
```

## Development

```sh
npm install
npm run dev -- chat        # run directly with tsx, no build step
```

or build once and run the compiled CLI:

```sh
npm run build
node dist/cli.js chat
```

Run the test suite (Node's built-in test runner via `tsx`, no extra test
framework dependency):

```sh
npm test
```

CI (`.github/workflows/ci.yml`) builds, runs the test suite, and runs a
cross-platform smoke test of `run_shell`/`search_files` on real Linux,
Windows, and macOS GitHub Actions runners on every push — this is what
actually verifies Windows support, not just code review, since none of
this development happens on a Windows machine directly.

This is proprietary, closed-development software (see [License](#license))
— it isn't set up to accept outside contributions.

## Roadmap

- Additional providers (Gemini, Bedrock, etc.) behind the same `ChatProvider` interface
- Auto-detect project context (language, test runner, lint config) to seed memory/system prompt automatically, instead of starting cold each session
- Cost/budget guard — a per-session token or dollar cap for paid providers

## License

Copyright &copy; TokenBurners. All rights reserved — see [LICENSE](LICENSE).
This is proprietary software: the source is visible on GitHub, but no
license is granted to use, copy, modify, or redistribute it beyond what
TokenBurners separately permits for a published build.
