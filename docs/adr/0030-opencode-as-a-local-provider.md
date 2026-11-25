# 0030. OpenCode as a local model provider

Date: 2026-11-25
Status: Accepted

## Context

Scope Bot already runs Claude Code and Codex as local CLI providers (ADR 0006, ADR 0007). OpenCode (opencode.ai) is another CLI that reaches the providers and plans signed in on the machine that runs the server, including free models. A business that already uses OpenCode should not need a second account or an API key in `.env`.

Like the other local providers, OpenCode keeps its credentials on the machine. Keys added in the app stay encrypted in PostgreSQL and never reach the browser or the desktop app.

## Decision

- **Add `opencode` to `ProviderId` and build a provider in `packages/agents`.** It appears on the providers screen and in the model picker next to Claude Code and Codex.
- **Read the catalog from the CLI.** `opencode --version` gives the version, `opencode models --verbose` gives the models, and `opencode debug config` gives the default model. A model keeps its `provider/model` id, its OpenCode provider id as the group, its name, its cost, and its variants as reasoning efforts. Both costs at zero means free.
- **Run replies with `opencode run --pure --format json`.** The customer conversation goes through stdin, never through an argument. The system prompt is written as `AGENTS.md`, photos are passed with `--file`, and the run uses an empty temporary folder. The child's `PWD` is set to that folder, because OpenCode looks up `AGENTS.md` through it and a spawned process otherwise keeps the server's `PWD`. The JSON events give the text, token counts and failures.
- **Allow only read-only tools inside that folder.** An `opencode.json` sets `permission` so `read`, `grep`, `glob` and `list` are allowed and every other tool is denied, including `bash`, edits, `task`, `webfetch` and `external_directory`. OpenCode needs the `read` tool to load `AGENTS.md`, so denying it makes `opencode run` wait instead of starting. `--pure` keeps external plugins out. This is the V1 `permission` format OpenCode 1 expects; OpenCode 2 uses `permissions`, which this server does not send.
- **Do not store a key for OpenCode.** OpenCode manages its own credentials and can reach several providers, so one key saved in Scope Bot has no unambiguous destination. The providers screen points people to `opencode auth login` on the server instead.
- **Parse CLI output at the boundary.** Versions, model blocks, the configured default and JSON events are decoded with Effect Schema. An unknown event or an unreadable model list becomes `ModelFailed` or a provider status, never a crash.
- **Keep the provider out of the sign-in flow.** There is no browser sign-in button: the person signs in to OpenCode on the server, as they would for any other local use of the CLI.

## Consequences

- A server with OpenCode's free models shows OpenCode as connected without an account. Models that need a provider the person has not signed in to fail with `ModelNotConfigured` when chosen.
- The model list follows the providers and environment variables OpenCode sees on the server, not the business in Scope Bot. Several businesses on one server share the same OpenCode installation, as they already share Claude Code and Codex (ADR 0028).
- The default model is OpenCode's configured default when it appears in the list, otherwise the first listed model.
- Streaming depends on the JSON text events. Live answers update as those events arrive, not through a separate transport.
- A new OpenCode version can add or rename tools and change the `permission` schema. The denied list and the `--pure` flag need a review when the installed CLI changes.
- OpenCode needs the read-only tools to run at all, so the boundary is an empty folder plus denied access outside it, not a process without tools.
