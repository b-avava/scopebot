# 0004. First agent slice: creating agents, chat and settings

Date: 2026-11-04
Status: Accepted

## Context

The first vertical slice lets a business create an agent, change its settings and chat with it. PostgreSQL is not available on the development machine yet, and the LLM provider is still an open question in the README.

## Decision

- **Agents run on the server.** The desktop main process calls the typed HTTP API and the renderer reaches it through the `window.scopeBot` bridge. API keys stay on the server.
- **`Store` (`packages/db`) is the only storage boundary.** It has a JSON file layer and a memory layer for tests. The file layer is temporary: it keeps the slice usable until PostgreSQL is set up, and only this service changes then.
- **`ChatModel` (`packages/agents`) hides the provider,** chosen with `LLM_PROVIDER`. `anthropic` uses the official SDK wrapped in Effect, with `claude-opus-5-5` as the default model, `effort: low` because replies are short, and server-side refusal fallback where the model supports it. `openai-compatible` calls any `/chat/completions` API through the Effect HTTP client. Another kind of provider is a new layer.
- **An agent's model is a free-text id,** because the list depends on the provider. Empty means the server default from `LLM_MODEL`. The settings screen now offers the provider's list, see ADR 0006.
- **Settings are mostly structured, not a prompt.** Limits, working hours, handoffs and tone are fields, and new agents get defaults from their job. Working hours and the daily reply limit are enforced in code, before the model is called. A handoff stops the agent in code until a human gives the chat back; the model only signals one with a `[[HANDOFF: reason]]` tag. Permissions and the discount limit are stored and sent as instructions for now, because agents have no tools yet: they must be enforced in the tool layer when tools arrive.
- **`BusinessProfile` holds the facts** all agents may tell customers, in place of CRM data that does not exist yet.
- **Every reply is audited** as an `AgentAction`, including failed ones, with tokens for cost tracking and the source message.
- **The chat is a test chat:** a person in the desktop app writes as a customer. WhatsApp and Telegram come later and will use the same `AgentChat` service.
- **The API listens on `127.0.0.1`** because it has no authentication yet.
- **`BotAvatar` (`packages/ui`) is our own component,** drawn with flat SVG shapes: eight shapes, sixteen faces and ten colours, stored in the agent's settings. The look follows the avatars of grokbots.ai, whose code and artwork carry no open licence, so nothing was copied from them. Only large avatars follow the cursor and blink; lists and messages stay still.

## Consequences

- No multi-tenancy, users or authentication yet. This must come before any deployment beyond one machine.
- One conversation per agent, and the whole history is sent on every turn. Long conversations will need a limit or compaction.
- Agents have no tools yet, so approvals and policies are only instructions. A prompt is not a guarantee, so this must not ship to customers as a safety control. The approval card stays in `packages/ui` for that slice.
- `Store` upgrades older data files when it loads them. This goes away with real migrations in PostgreSQL.
- The JSON file rewrites all data on every change, which is fine for development and not for production.
- Replies are not streamed: the user sees a typing indicator until the full answer arrives.
- If the model fails, the customer's message stays in the conversation, so sending it again produces a second copy.
