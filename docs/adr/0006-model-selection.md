# 0006. Choosing a model per agent, with backups

Date: 2026-11-06
Status: Accepted, updated by ADR 0007

## Context

An agent's model was a free-text field, and one failed model left the customer without a reply. OpenBot (openbot.run) solves both: a picker filled from the provider, model and reasoning kept per agent, and an ordered list of backups. Its current licence is PolyForm Noncommercial, so only the behaviour described in its public documentation was followed. No code was read or copied.

## Decision

- **`ChatModel.models` lists what the provider offers,** served at `GET /models`. Anthropic uses the models API. OpenAI-style providers use `/models`, with non-chat models filtered out by id, because that endpoint does not say what a model is for.
- **The picker shows free models first, then each lab together.** A model is free when its id ends in `:free`, the OpenRouter convention, and its lab is the part of the id before `/`. Without the list, for example without a key, the screen falls back to typing the id.
- **Every agent has its own `reasoning` level.** `default` keeps today's behaviour: `low` on Anthropic and nothing sent to OpenAI-style providers. Other levels are sent as they are, so a model that does not support them can fail.
- **Every agent has up to eight `backupModels`, tried in order.** A model that fails is skipped for ten minutes, unless no other model is ready. The cooldown lives in server memory and resets with a restart.
- **A switch only happens on `ModelFailed`.** Nothing has reached the customer at that point. A refusal never switches, because asking another model would work around it. A rejected key does not switch either, because every model uses the same key.
- **A switch leaves a `note` in the chat and a failed action in the audit log.** Notes are for supervisors and are never sent to a model.

## Consequences

- There is still one provider per server, chosen with `LLM_PROVIDER`, so backups do not help when the whole provider is down. OpenRouter gives one key to many labs in the meantime.
- Several providers at once need somewhere to keep several keys, which should wait for PostgreSQL and authentication.
- Signing in with a ChatGPT or Claude plan, downloading provider runtimes and the Agent Client Protocol are not adopted: they work through CLIs on a user's computer, and our agents run on the server.
- Once agents have tools, the rule must become stricter: a turn that already ran a tool must not switch models, or it could repeat the action.
- The filter for non-chat models needs updating when a provider adds a new kind of model.
