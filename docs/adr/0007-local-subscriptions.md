# 0007. Local subscriptions as model providers

Date: 2026-11-07
Status: Accepted

Updates ADR 0006, which kept one provider per server and ruled out subscriptions.

## Context

Claude Code and Codex are often already signed in on the computer running the app. Using those accounts lets a person try agents without an API key, the way OpenBot does. ADR 0006 dismissed this because agents run on the server, but during development and in a single-machine setup the server runs on that same computer.

## Decision

- **`ModelProviders` is the one door to every model.** An agent stores a `provider` (`api`, `claude-code` or `codex`) next to its `model`, and backups are provider and model pairs, so a backup can be on another provider. `ChatModel` stays the key in `.env` and is now the `api` provider.
- **Detection runs where the agent runs: in the server.** It only asks the CLIs: `--version`, then `claude auth status` or `codex login status`. Credential files are never read. The server stores none of it. It passes on whether someone is signed in, the plan and the email, which the providers page shows on this computer; the organisation stays out.
- **The CLIs give their own model lists** through the Claude Code `initialize` control request and `codex debug models`. Neither calls a model. Both are internal interfaces, so a CLI update can break them; the provider then shows no models instead of failing.
- **A CLI that talks to customers has no tools.** Claude Code runs with `--tools ""`, no MCP servers and no user settings. Codex has no such switch, so `CodexProvider` turns off each tool by name, ignores the user's config and uses a read-only sandbox. Both start in a new empty folder that is deleted afterwards. A customer message that asked to read a file outside it failed on both CLIs.
- **Customer text never reaches the command line.** It goes through stdin as JSON, so it cannot become a flag or forge a turn. The system prompt goes through a file. Model ids are checked before use, and no shell is involved.
- **A switch to a backup now also happens when a provider is not connected,** because a backup can be on another provider. Refusals still never switch.

## Consequences

- This is for trying agents on your own computer. Before a real clinic uses an agent, move it to an API key. A personal subscription is not meant to serve other people's customers: Anthropic's Agent SDK documentation says third parties may not offer claude.ai login for their products, its rules on this changed several times during 2026, and OpenAI's pages do not cover the case. Check the current terms before relying on it.
- On a cloud server the CLIs are absent, so only `api` shows up. Nothing needs switching off.
- Each reply starts a process, which adds a few seconds compared with an API call, and the whole conversation is sent every time.
- The Codex tool list is a denylist. A new Codex version can add a tool that is on by default, so it must be reviewed when updating Codex.
- More CLIs (Gemini, Cursor and others) are not included, because each needs its own check that its tools are off. Each one is a new `ChatProvider`.

## Providers page

- **The `+` in the model picker opens a page to connect providers.** It lists what is connected and what is not, and each provider has its own page with sign in, API key, version, the models shown in the picker and a switch to use it. Choices are `ProviderPreferences` in `Store`.
- **Keys added in the app live in `ProviderKeys`,** a separate file next to the data file, as plain as `.env`. The API only says whether a key exists. Without authentication this is fine on one computer only, so keys move to encrypted storage with PostgreSQL and authentication.
- **OpenRouter, DeepSeek and a custom address reuse the OpenAI-style client.** A key on the Claude or ChatGPT page goes to the CLI as `ANTHROPIC_API_KEY` or `CODEX_API_KEY`, which also moves that provider off a personal subscription.
- **A provider appears only when it works.** Providers without an integration are not listed as placeholders.
