# Contributing to Scope Bot

This file is for people and AI coding assistants who change the code. Read [docs/architecture.md](docs/architecture.md) first: it holds the product principles, the architecture and the rules every change follows. **AI assistants: read both files fully before making any change, and follow the rules in [Working with AI](#working-with-ai).**

---

## Development setup

Requires Node.js 24+, pnpm 11 and PostgreSQL 15 or newer. Copy `.env.example` to `.env` and set `DATABASE_URL`, `TEST_DATABASE_URL` and `SCOPE_BOT_SECRET`. The server creates its tables on start.

```sh
pnpm install
pnpm dev          # server on http://localhost:3000 + desktop app window
pnpm dev:server   # server only
pnpm dev:desktop  # desktop app only (shows "Server offline" without a server)
pnpm dev:web      # the interface in a browser at http://localhost:5174, with a server running
pnpm build:web    # builds the browser interface into apps/desktop/dist/web
pnpm check        # lint + typecheck + tests, some of them on PostgreSQL
pnpm db:import <email>  # moves the old JSON data files into that account's business
pnpm user:reset-password <email>  # prints a new password and signs that person out everywhere
pnpm lint:fix     # format and apply safe lint fixes
```

`pnpm dev:web` serves the same interface the desktop app shows, with a bridge for the browser in `apps/desktop/web`. Vite passes `/api` to the server at `SCOPE_BOT_SERVER_URL`, so the page and the API share one address and the session cookie works (ADR 0029). Built with `pnpm build:web`, the server itself serves the page at `/` and its files under `/assets/`, with the CSP and other security headers, from `WEB_DIR` or `apps/desktop/dist/web`.

On an empty database the server writes a setup code to its log. The app asks for it to create the first business and its owner; after that, people join with invites unless `SIGNUP=open` (ADR 0028).

The first `pnpm dev` downloads the Electron binary, so it takes longer. Stopping either process in `pnpm dev` stops both.

To add a beUI component, run `pnpm dlx shadcn@latest add @beui/<slug>` inside `packages/ui`.

Agents answer through Claude Code, Codex or OpenCode if you are signed in to them on this computer, which is meant for trying things out (see ADR 0007 and ADR 0030). For an API key, copy `.env.example` to `.env` and set `LLM_PROVIDER` and `LLM_API_KEY`. Both Anthropic and any OpenAI-style API work; see the comments in that file. Check the server with `GET /health`; the API description is at `GET /openapi.json`. The server listens on `127.0.0.1` unless `HOST` says otherwise. It speaks plain HTTP, so a server reachable from outside needs TLS in front of it. `pnpm db:import` reads the JSON files that older versions kept in `apps/server/.data/`.

---

## Coding conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Effect everywhere on the server and in Electron main:
  - typed domain errors (tagged errors), never `throw` in domain code;
  - services via the v4 service/layer pattern; dependencies provided by layers at the edge;
  - wrap Promise-based libraries in a dedicated service (`Effect.tryPromise`), never call them directly from domain code.
- Validation and serialization via Effect Schema; schemas live in `packages/domain` and `packages/contracts`.
- Every tool and every integration has tests (`@effect/vitest`), with external systems replaced by test layers.
- Code, comments, commit messages and docs in **English**.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- `main` is protected: every change goes through a pull request with green CI (see `docs/adr/0005-ci-and-code-style.md`). The pull request title becomes the commit on `main`, so it follows the same format; releases are built from these titles (ADR 0027).
- Contributions are licensed under the [AGPL-3.0](LICENSE), like the rest of the project. There is no CLA.

---

## Working with AI

Rules for AI coding assistants on this project:

1. **Read this file and [docs/architecture.md](docs/architecture.md) first.** Then read the relevant `docs/` files and existing code in the area you are changing.
2. **Effect v4 only.** Verify APIs against v4 docs/source. Do not write v3 patterns from memory. If unsure, ask.
3. **Small vertical slices.** Prefer one complete, tested feature (schema → repository → service → RPC → UI) over broad scaffolding.
4. **Follow existing patterns** in the codebase before introducing new ones.
5. **Do not add dependencies** without stating why and getting approval.
6. **Respect the product principles** (section 2 of [docs/architecture.md](docs/architecture.md)), especially: agents never bypass domain services, numbers come from SQL, risky tools require approval.
7. **Record decisions.** Any significant architectural choice gets an ADR in `docs/adr/`. Update `docs/architecture.md`, `docs/domain.md`, `docs/roadmap.md` and the README when they become outdated.
8. **Provide copy-paste-ready code.** Complete files or exact diffs, not fragments with "...rest of the code".
9. **Communication:** talk to the person you work with in the language they write in; keep code, comments and docs in English.
10. **Say what you did not verify.** If something was not run or tested, state it explicitly.

### Prompt template for new tasks

```
Context: Scope Bot (see CONTRIBUTING.md and docs/architecture.md). Area: <package/app>.
Task: <what to build or change>.
Constraints: Effect v4, follow existing patterns in <files>, add tests.
Output: complete files or exact diffs; list of what was not verified.
```
