# Roadmap

What is planned, in order, and the questions that are still open. How the parts fit together is in [architecture.md](architecture.md).

## Phase 1 — MVP

- CRM core: contacts, deals, pipelines, activities, documents
- One agent type: **front desk / sales** on WhatsApp + Telegram — answers, records contacts and deals, moves deals forward, follows up
- Approval queue and audit log UI (the activity log is in, see ADR 0022)
- Chat with an employee: steps and reasons under answers, answer again, edit the last question, feedback and rules from the team (ADR 0023). Markdown and day cards drawn from the calendar (ADR 0024). Answers written live, with steps and Stop (ADR 0025). Voice input with ElevenLabs Scribe (ADR 0026)
- Bitrix24 import
- Dashboard: funnel conversion by stage, response times
- Web interface served by the server, the main way people work (ADR 0027)
- Desktop app: the same interface + notifications for approvals (executor not required yet)
- Self-hosted setup: Docker Compose with PostgreSQL and HTTPS, a setup guide, and a way to update an existing install
- Releases: one version for the repository, a Docker image and installers for every release (ADR 0027)

## Phase 2

- Departments with multiple cooperating agents and handoffs
- Voice agent (inbound/outbound calls)
- File connector (executor tier 2)
- Payments module
- Booking module

## Phase 3

- Computer use executor (tier 3) on Windows, ideally on a dedicated VM/session per agent
- Recorded workflows replayed without LLM, with LLM fallback on deviations
- Industry modules on top of the general core

## Open questions

- Which LLM providers and models per agent type (cost vs quality, Russian/Georgian language quality)?
- Which voice stack for phase 2?
- Payment providers per country.
- What a business must know about data residency before choosing where to run its server.
