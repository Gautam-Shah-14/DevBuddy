<p align="center">
  <img src="assets/devbuddy-banner-dark.svg" alt="DevBuddy Agent" width="100%">
</p>

# DevBuddy Agent 🔥

<p align="center">
  <a href="https://github.com/Gautam-Shah-14/DevBuddy/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/Gautam-Shah-14/DevBuddy"><img src="https://img.shields.io/badge/Built%20by-TokenBurners-blueviolet?style=for-the-badge" alt="Built by TokenBurners"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/Lang-中文-red?style=for-the-badge" alt="中文"></a>
  <a href="README.ur-pk.md"><img src="https://img.shields.io/badge/Lang-اردو-green?style=for-the-badge" alt="اردو"></a>
  <a href="README.es.md"><img src="https://img.shields.io/badge/Lang-Español-orange?style=for-the-badge" alt="Español"></a>
</p>

**DevBuddy is a self-improving local-first AI agent, by TokenBurners**, built on top of
[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research, MIT-licensed).
It creates skills from experience, improves them during use, nudges itself to persist
knowledge, searches its own past conversations, and builds a deepening model of who you are
across sessions. Runs fully on your own machine against your own local Ollama — no API keys,
no cloud calls required — or against OpenAI/Anthropic/any OpenAI-compatible endpoint if you'd
rather.

Switch providers/models with `devbuddy model` — no code changes, no lock-in.

<table>
<tr><td><b>A real terminal interface</b></td><td>Full TUI with multiline editing, slash-command autocomplete, conversation history, interrupt-and-redirect, and streaming tool output.</td></tr>
<tr><td><b>Lives where you do</b></td><td>Telegram, Discord, Slack, WhatsApp, Signal, and CLI — all from a single gateway process. Voice memo transcription, cross-platform conversation continuity.</td></tr>
<tr><td><b>A closed learning loop</b></td><td>Agent-curated memory with periodic nudges. Autonomous skill creation after complex tasks. Skills self-improve during use. FTS5 session search with LLM summarization for cross-session recall. Compatible with the <a href="https://agentskills.io">agentskills.io</a> open standard.</td></tr>
<tr><td><b>Scheduled automations</b></td><td>Built-in cron scheduler with delivery to any platform. Daily reports, nightly backups, weekly audits — all in natural language, running unattended.</td></tr>
<tr><td><b>Delegates and parallelizes</b></td><td>Spawn isolated subagents for parallel workstreams. Write Python scripts that call tools via RPC, collapsing multi-step pipelines into zero-context-cost turns.</td></tr>
<tr><td><b>Local-first by default</b></td><td>No Docker, no server, no API key required to start — `devbuddy` talks straight to your local Ollama. Docker and six other terminal backends (SSH, Singularity, Modal, Daytona, Vercel Sandbox) are available for sandboxed/remote execution when you want them, never required.</td></tr>
</table>

---

## Quick Install

> **Docker is optional, not required.** `devbuddy` is a plain Python console script — it
> runs directly on your machine against your own local Ollama (or OpenAI/Anthropic/any
> provider) with no container involved. `docker-compose.yml` in this repo only stands up
> the *gateway* and *dashboard* services (the always-on messaging-platform bridge and web
> UI) for people who want it running as a background service reachable from Telegram,
> Discord, etc. If you just want to chat with it from a terminal, skip Docker entirely.

This repo doesn't have a hosted installer yet — run it from source:

```bash
git clone https://github.com/Gautam-Shah-14/DevBuddy.git && cd DevBuddy
source ./activate      # provisions + activates a local Python/Node environment (no Docker)
devbuddy                # start chatting — defaults to your local Ollama
```

`source ./activate` needs Python 3.14 (the project's real pin — earlier versions don't
resolve its dependencies at all) and Node.js; see `AGENTS.md` for the PM tool-manager
workflow it uses under the hood (activation, daily use, dependency changes, running tests).

### Windows / Android

The old hosted one-click installers (`install.sh` / `install.ps.1`, the Termux APT repo)
pointed at Nous Research's own domain and don't apply to this fork yet. Native Windows and
Termux/Android both work via the same from-source path above; there's just no packaged
one-liner for them here yet.

---

## Getting Started

```bash
devbuddy              # Interactive CLI — start a conversation
devbuddy model        # Choose your LLM provider and model
devbuddy tools        # Configure which tools are enabled
devbuddy config set   # Set individual config values
devbuddy config get   # Print individual config values
devbuddy gateway      # Start the messaging gateway (Telegram, Discord, etc.)
devbuddy setup        # Run the full setup wizard (configures everything at once)
devbuddy claw migrate # Migrate from OpenClaw (if coming from OpenClaw)
devbuddy update       # Update to the latest version
devbuddy doctor       # Diagnose any issues
```

### Data & config location

All local state — `config.yaml`, `.env` secrets, the session database, skills, logs, named
profiles — lives under `~/.devbuddy` (`%LOCALAPPDATA%\devbuddy` on native Windows). This is
controlled by one place in the code (`devbuddy_constants._get_platform_default_hermes_home()`);
the `HERMES_HOME` environment variable still overrides it the same way it always did, if you
want data stored somewhere else entirely (a different drive, a synced folder, a container
volume, etc.):

```bash
export HERMES_HOME=/path/to/your/data   # optional override; defaults to ~/.devbuddy
devbuddy doctor                          # confirms where it's reading/writing from
```

`devbuddy doctor` and `devbuddy profile list` both print the active home path if you want to
double-check where things actually landed.

---

## CLI vs Messaging Quick Reference

DevBuddy has two entry points: start the terminal UI with `devbuddy`, or run the gateway and
talk to it from Telegram, Discord, Slack, WhatsApp, Signal, or Email. Once you're in a
conversation, many slash commands are shared across both interfaces.

| Action                         | CLI                                           | Messaging platforms                                                              |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- |
| Start chatting                 | `devbuddy`                                    | Run `devbuddy gateway setup` + `devbuddy gateway start`, then message the bot    |
| Start fresh conversation       | `/new` or `/reset`                            | `/new` or `/reset`                                                               |
| Change model                   | `/model [provider:model]`                     | `/model [provider:model]`                                                        |
| Set a personality              | `/personality [name]`                         | `/personality [name]`                                                            |
| Retry or undo the last turn    | `/retry`, `/undo`                             | `/retry`, `/undo`                                                                |
| Compress context / check usage | `/compress`, `/usage`, `/insights [--days N]` | `/compress`, `/usage`, `/insights [days]`                                        |
| Browse skills                  | `/skills` or `/<skill-name>`                  | `/<skill-name>`                                                                  |
| Interrupt current work         | `Ctrl+C` or send a new message                | `/stop` or send a new message                                                    |
| Platform-specific status       | `/platforms`                                  | `/status`, `/sethome`                                                            |

---

## Documentation

This fork doesn't have its own docs site yet. [Hermes Agent's own docs](https://hermes-agent.nousresearch.com/docs/)
are the best reference for most features (CLI usage, configuration, messaging gateway,
tools/toolsets, skills, memory, MCP, cron) — this fork's agent core, CLI, and gateway are
still Hermes Agent underneath, just renamed and pointed at `~/.devbuddy` by default instead
of `~/.hermes`. `AGENTS.md` in this repo is the authoritative reference for this fork's own
code layout and conventions.

---

## Migrating from OpenClaw

If you're coming from OpenClaw, DevBuddy can automatically import your settings, memories,
skills, and API keys.

**During first-time setup:** The setup wizard (`devbuddy setup`) automatically detects
`~/.openclaw` and offers to migrate before configuration begins.

**Anytime after install:**

```bash
devbuddy claw migrate              # Interactive migration (full preset)
devbuddy claw migrate --dry-run    # Preview what would be migrated
devbuddy claw migrate --preset user-data   # Migrate without secrets
devbuddy claw migrate --overwrite  # Overwrite existing conflicts
```

What gets imported:

- **SOUL.md** — persona file
- **Memories** — MEMORY.md and USER.md entries
- **Skills** — user-created skills → `~/.devbuddy/skills/openclaw-imports/`
- **Command allowlist** — approval patterns
- **Messaging settings** — platform configs, allowed users, working directory
- **API keys** — allowlisted secrets (Telegram, OpenRouter, OpenAI, Anthropic, ElevenLabs)
- **TTS assets** — workspace audio files
- **Workspace instructions** — AGENTS.md (with `--workspace-target`)

See `devbuddy claw migrate --help` for all options, or use the `openclaw-migration` skill for
an interactive agent-guided migration with dry-run previews.

---

## About this fork

This is a from-scratch rewrite direction for the DevBuddy project (previously a standalone
TypeScript CLI): rather than keep extending that smaller codebase, it's now built on top of
Hermes Agent's own (much larger, MIT-licensed) agent platform, rebranded and pointed at
`~/.devbuddy` by default. Not all of Hermes' own branding has been swept from every corner of
the codebase yet — comments, a handful of third-party-integration default identifiers, and
the Hermes docs site are known to still say "Hermes" in places. The module layout
(`devbuddy_cli/`, `devbuddy_constants.py`, `devbuddy_state*.py`, etc.), the `devbuddy` CLI
command, the default data path, and the startup banner/skin are all genuinely renamed and
tested.

This is closed-development software — not currently accepting outside contributions.

---

## License

MIT — see [LICENSE](LICENSE). Built on [Hermes Agent](https://github.com/NousResearch/hermes-agent)
(MIT, Nous Research). This fork is built by TokenBurners.
