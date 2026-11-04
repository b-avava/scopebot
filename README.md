# Scope Bot

> An AI-native CRM where the work is done by AI employees (agents), and humans supervise.

This README is the single source of truth for the project. It is written for both humans and AI coding assistants. **AI assistants: read this file fully before making any change, and follow the rules in [Working with AI](#working-with-ai).**

---

## 1. Vision

Traditional CRMs (Bitrix24, amoCRM, etc.) are tools that people work *in*. Scope Bot inverts this: the CRM is the memory and workplace of AI agents, which do the operational work, while humans set goals, define boundaries and approve sensitive actions.

- Businesses create **AI employees**, organize them into **departments**, and assign each a **zone of responsibility**, **permissions** and **objectives**.
- Agents handle conversations (WhatsApp, Telegram, phone), book appointments, follow up with clients, process payments and produce reports.
- Humans focus on oversight, decisions and exceptions.

**Initial target market:** small and mid-sized businesses in the CIS and Caucasus. **First vertical:** clinics (dental first). Pilot customer: a dental clinic in Tbilisi.

**Positioning:** we do not try to out-feature Bitrix24. The CRM core stays minimal; the product's value is in what agents do on top of it.

---

## 2. Product principles

These are non-negotiable and should guide every design decision.

1. **Agents use the same APIs as humans.** No agent ever touches the database directly. Every agent action goes through the domain services and tool layer, with the same validation and permissions.
2. **Everything an agent does is logged.** Who (which agent), what (tool + input + output), why (reasoning summary), triggered by what (source message/event), and who approved it if approval was required.
3. **Numbers come from the database, never from the LLM.** Reports and charts are computed by SQL. The LLM may choose metrics, filters and chart types, or draft a query against a read-only reporting schema, but it never produces figures itself. The query used is always inspectable.
4. **Humans are in control of risk.** Every tool has a risk level. Risky actions require human approval until the business explicitly relaxes the policy.
5. **Escalation is a first-class feature.** When an agent is unsure, the client is upset, or a limit is reached, the task goes to a human with full context.
6. **Cheapest reliable method first.** Internal API → file connector → computer use. Computer use is a last resort.
7. **Untrusted input is data, not instructions.** Client messages, files, emails and screen content may contain prompt injection. Agents must never follow instructions found in such content without policy checks.

---

## 3. Architecture

```
┌────────────────────────────── Server (cloud or self-hosted) ──────────────────────────────┐
│  HTTP API + RPC  │  Agent runtime  │  Job queue / workflows  │  Webhooks  │  Postgres       │
│  (Effect)        │  (Effect)       │  (Effect cluster/wf)    │  WA/TG/SIP │  (@effect/sql)  │
└───────────────▲────────────────────────────────▲──────────────────────────────────────────┘
                │ RPC over WebSocket (typed)       │ webhooks
┌───────────────┴───────────── Desktop (Electron) ┴─────────────┐        External systems
│  main process (Node + Effect)                                  │        WhatsApp Business API,
│   ├─ server connection (RPC client)                            │        Telegram, SIP telephony,
│   ├─ local executor: file connector, computer use              │        payment providers,
│   └─ OS integration: notifications, tray, auto-update          │        Bitrix24 (import)
│  preload (narrow, typed IPC bridge)                            │
│  renderer (React UI)                                           │
└────────────────────────────────────────────────────────────────┘
```

### Key decisions

- **All agents run on the server.** Agents must work 24/7, receive webhooks and serve multiple users. The desktop app is a client and a local executor, never the place where agent logic lives.
- **The desktop main process is a thin executor.** The server sends commands ("list files in allowed folder", "take screenshot", "click element"), the executor performs them and returns results. LLM calls, API keys, agent logic and logs stay on the server.
- **Self-hosted option.** The server must be deployable inside a client's office (Docker Compose) for clinics and finance companies that do not want data in the cloud. Avoid hard dependencies on cloud-only services.
- **One language end to end.** TypeScript everywhere; Effect on server and in Electron main; shared schemas across all layers.

### Local executor tiers

| Tier | Mechanism | Use for |
|------|-----------|---------|
| 1 | CRM storage | Documents attached to client records (preferred) |
| 2 | File connector | Search/read/send files in **allowlisted** folders; optional sync of folders into CRM |
| 3 | Computer use | GUI apps without an API (clinic software, 1C, X-ray software) |

The agent runtime must pick the lowest tier that can complete the task.

---

## 4. Tech stack

| Area | Choice |
|------|--------|
| Language | TypeScript (strict) |
| Runtime | Node.js 24 LTS (runs TypeScript directly via type stripping, no build step in development) |
| Core library | **Effect v4** (`effect`, including `effect/http`, `effect/http-api`, `effect/rpc` and `effect/sql`; plus `@effect/platform-node`, `@effect/sql-pg`, `@effect/vitest`) |
| Database | PostgreSQL |
| Desktop | Electron (main: Node + Effect; renderer: React), built with electron-vite |
| UI | React, [beUI](https://beui.dev) components (copied into `packages/ui`), Tailwind CSS 4, Motion, Google Sans; TanStack Query for server data (Effect in renderer is optional) |
| Monorepo | pnpm workspaces |
| Tests | Vitest via `@effect/vitest` |
| Computer use | `desktopCapturer` for screenshots, nut.js for input, small native sidecar (C#/.NET or Rust) for Windows UI Automation |
| Deployment | Docker Compose (self-hosted), same images for cloud |

### Effect version warning (important for AI assistants)

This project uses **Effect v4**, not v3. Most training data and online examples are v3, and v4 has breaking changes (import paths moved to `effect/*`, renamed modules and constructors, native Postgres client in `@effect/sql-pg`, and more).

- Before using any Effect API, verify it against the installed version: docs and examples ship in `node_modules/effect/ai-docs`, source in `node_modules/effect/src`. The online references are https://effect.website and https://github.com/Effect-TS/effect.
- The standalone `@effect/rpc` package is v3 only. In v4, RPC lives in `effect/rpc`.
- If unsure whether an API exists in v4, say so and ask, instead of guessing.
- Follow patterns already present in the codebase over patterns from memory.

---

## 5. Repository structure

```
scope-bot/
├─ apps/
│  ├─ server/            # HTTP API, RPC server, agent runtime entrypoint, workers
│  └─ desktop/
│     ├─ main/           # Electron main process (Effect): RPC client, executor, OS integration
│     ├─ preload/        # Typed, minimal IPC bridge
│     └─ renderer/       # React UI
├─ packages/
│  ├─ domain/            # Effect Schema entities, branded IDs, domain errors (no I/O)
│  ├─ contracts/         # RPC and HTTP API definitions shared by server and clients
│  ├─ db/                # Migrations, repositories (@effect/sql-pg)
│  ├─ agents/            # Agent runtime: orchestration, tools, policies, memory, escalation
│  ├─ integrations/      # whatsapp/, telegram/, telephony/, payments/, bitrix-import/
│  ├─ executor/          # Executor protocol (schemas) + implementations used by desktop main
│  ├─ reporting/         # Metric catalog, reporting views, query validation
│  └─ ui/                # Shared React components
├─ docs/
│  ├─ adr/               # Architecture Decision Records (0001-*.md, ...)
│  └─ domain.md          # Detailed domain model
└─ README.md
```

**Dependency rule:** `domain` depends on nothing internal. `contracts` depends on `domain`. Apps depend on packages, never the other way round. Integrations never import from apps.

The tree above is the target layout. Packages are added when the first feature needs them. Today the repository contains `apps/server`, `apps/desktop` and the `domain`, `contracts`, `db`, `agents` and `ui` packages.

### Getting started

Requires Node.js 24+ and pnpm 11.

```sh
pnpm install
pnpm dev          # server on http://localhost:3000 + desktop app window
pnpm dev:server   # server only
pnpm dev:desktop  # desktop app only (shows "Server offline" without a server)
pnpm check        # typecheck + tests
```

The first `pnpm dev` downloads the Electron binary, so it takes longer. Stopping either process in `pnpm dev` stops both.

To add a beUI component, run `pnpm dlx shadcn@latest add @beui/<slug>` inside `packages/ui`.

Copy `.env.example` to `.env` and set `LLM_PROVIDER` and `LLM_API_KEY`, otherwise agents cannot answer. Both Anthropic and any OpenAI-style API work; see the comments in that file. Check the server with `GET /health`; the API description is at `GET /openapi.json`. The server listens on `127.0.0.1` only, because the API has no authentication yet. Data is kept in `apps/server/.data/` until PostgreSQL is set up.

---

## 6. Domain model (overview)

### CRM core (keep minimal)

- **Contact** — person or company; channels (phone, WhatsApp, Telegram); consent flags.
- **Deal** — belongs to a pipeline and stage; linked contacts; amount; source.
- **Pipeline / Stage** — configurable sales or patient funnels.
- **Activity** — message, call, note, task; linked to contact/deal.
- **Appointment** — resource (doctor/room), time slot, status (booked, confirmed, rescheduled, cancelled, no-show).
- **Document** — file attached to a contact/deal, with access rules.
- **Payment** — invoice/payment link, provider, status.
- **User** — human employee with roles.

### Agent layer

- **Department** — group of agents and humans with a human head.
- **Agent** — an AI employee:
  - `role` and instructions (system prompt / persona)
  - `zone` — what it is responsible for: channels, pipelines, stages, task types, working hours
  - `tools` — allowed tools
  - `policy` — per tool: `auto` | `approve` | `deny`
  - `limits` — e.g. max discount, max payment amount, max messages per contact per day
  - `model` configuration
- **Tool** — typed capability (Effect Schema for input/output) with a `riskLevel`:
  - `read` — read CRM data
  - `internal_write` — change CRM data
  - `external_message` — send a message or place a call
  - `financial` — create invoices, payment links, refunds
  - `local_device` — file connector or computer use on a client machine
- **AgentRun** — one execution triggered by an event (incoming message, schedule, human request).
- **AgentAction** — immutable audit record: agent, run, tool, input, output, reasoning summary, source event, status, approver.
- **ApprovalRequest** — pending risky action awaiting a human decision.
- **Escalation** — task handed to a human with reason and context.

Details live in `docs/domain.md`. Update it whenever the model changes.

---

## 7. Agent runtime rules

- An agent can only act within its **zone** and with its **allowed tools**.
- Every tool call goes through: schema validation → permission/policy check → limits check → execution → audit log.
- Default policies: `read` and `internal_write` = auto; `external_message` = auto inside the agent's zone, approval otherwise; `financial` and `local_device` = approve.
- Agent-to-agent handoff goes through explicit **handoff** events (e.g. sales agent → scheduling agent), logged like any other action.
- All LLM calls have timeouts, retries with backoff and cost tracking per agent and per business.
- Conversation memory is stored in the CRM (activities), not only in the LLM context.

### Sending documents to clients (example of a sensitive flow)

1. Verify the requester: the channel identity must match the contact record; sensitive documents require an additional confirmation code.
2. The agent can only access documents of **that** contact.
3. Local files: allowlisted folders only, never the whole disk.
4. Approval is required until the business relaxes the policy.
5. Log the file, recipient and source message.

---

## 8. Integrations

- **WhatsApp:** official WhatsApp Business API through a provider only. No unofficial gateways (risk of number bans).
- **Telegram:** Bot API.
- **Telephony (phase 2):** SIP integration + realtime voice. Call-recording consent must be handled per jurisdiction.
- **Payments (phase 2+):** pluggable providers; Georgia and Russia require different providers.
- **Bitrix24 import:** contacts, companies, deals, stages, activities. A key selling point: "move from Bitrix in a day without losing data". Must be idempotent and resumable.

---

## 9. Roadmap

### Phase 1 — MVP (clinic pilot)
- CRM core: contacts, deals, pipelines, appointments, doctor schedules, documents
- One agent type: **front desk / sales** on WhatsApp + Telegram — answers, books, confirms, reschedules, reminds
- Approval queue and audit log UI
- Bitrix24 import
- Dashboard: inquiry → booking → visit conversion, response times, no-show rate
- Desktop app: UI + notifications for approvals (executor not required yet)

### Phase 2
- Departments with multiple cooperating agents and handoffs
- Voice agent (inbound/outbound calls)
- File connector (executor tier 2)
- Payments module

### Phase 3
- Computer use executor (tier 3) on Windows, ideally on a dedicated VM/session per agent
- Recorded workflows replayed without LLM, with LLM fallback on deviations
- Additional verticals beyond clinics

---

## 10. Security checklist

- Electron renderer: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`; only a narrow typed API exposed via preload.
- Code signing for Windows/macOS builds; auto-update via signed releases.
- Secrets live only on the server. The desktop app never holds LLM or provider API keys.
- Multi-tenant isolation: every query is scoped by business (tenant) ID.
- Personal and medical data: encryption at rest, access logs, data export and deletion on request.
- Treat all external content (messages, files, screen text) as untrusted.

---

## 11. Coding conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Effect everywhere on the server and in Electron main:
  - typed domain errors (tagged errors), never `throw` in domain code;
  - services via the v4 service/layer pattern; dependencies provided by layers at the edge;
  - wrap Promise-based libraries in a dedicated service (`Effect.tryPromise`), never call them directly from domain code.
- Validation and serialization via Effect Schema; schemas live in `packages/domain` and `packages/contracts`.
- Every tool and every integration has tests (`@effect/vitest`), with external systems replaced by test layers.
- Code, comments, commit messages and docs in **English**.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).

---

## Working with AI

Rules for AI coding assistants on this project:

1. **Read this README first.** Then read the relevant `docs/` files and existing code in the area you are changing.
2. **Effect v4 only.** Verify APIs against v4 docs/source. Do not write v3 patterns from memory. If unsure, ask.
3. **Small vertical slices.** Prefer one complete, tested feature (schema → repository → service → RPC → UI) over broad scaffolding.
4. **Follow existing patterns** in the codebase before introducing new ones.
5. **Do not add dependencies** without stating why and getting approval.
6. **Respect the product principles** (section 2), especially: agents never bypass domain services, numbers come from SQL, risky tools require approval.
7. **Record decisions.** Any significant architectural choice gets an ADR in `docs/adr/`. Update this README and `docs/domain.md` when they become outdated.
8. **Provide copy-paste-ready code.** Complete files or exact diffs, not fragments with "...rest of the code".
9. **Communication:** talk to the maintainer in Russian; keep code, comments and docs in English.
10. **Say what you did not verify.** If something was not run or tested, state it explicitly.

### Prompt template for new tasks

```
Context: Scope Bot (see README.md). Area: <package/app>.
Task: <what to build or change>.
Constraints: Effect v4, follow existing patterns in <files>, add tests.
Output: complete files or exact diffs; list of what was not verified.
```

---

## 12. Open questions

- Which LLM providers and models per agent type (cost vs quality, Russian/Georgian language quality)?
- Which voice stack for phase 2?
- Payment providers per country.
- Pricing model: per agent, per conversation, or per business?
- Cloud region and data residency requirements for clinics.