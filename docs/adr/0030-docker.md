# 0030. Running Scope Bot with Docker

Date: 2026-11-15
Status: Accepted. Builds on ADR 0027, which chose Docker Compose for self-hosting.

## Context

A business runs Scope Bot on its own server (ADR 0027), and the server already serves the web interface next to the API (ADR 0029). What is missing is a way to install it that needs neither Node, pnpm nor PostgreSQL on that machine, gives HTTPS when the server has a domain, and survives restarts and updates.

The server runs TypeScript directly with Node's type stripping, and the workspace packages export their TypeScript sources. Node does not strip types from files inside `node_modules`, so a copy that puts the packages there, such as `pnpm deploy` makes, cannot run.

## Decision

- **One image holds the server and the built web interface.** It is built from the `Dockerfile` at the root in stages: one builds the web interface with the desktop app's development dependencies, one installs only what the server needs to run, and the last copies both onto `node:24-slim`. The workspace keeps its layout in the image, so the packages stay links to their own folders, as in development. The server runs as the unprivileged `node` user, listens on `0.0.0.0:3000` inside the container, serves the interface from `WEB_DIR=/app/web`, and has a health check on `/health`.
- **`deploy/` holds what a server needs and nothing else:** `compose.yaml`, a `Caddyfile` and `.env.example`. Compose runs three services:
  - `db`: PostgreSQL 18, with its data in a named volume and a health check;
  - `server`: the image, started once the database is healthy, and not reachable from outside;
  - `caddy`: the only service with open ports, 80 and 443, passing everything to the server.
- **HTTPS comes from the address.** With `SCOPE_BOT_ADDRESS` set to a domain that points at the server, Caddy gets and renews a certificate by itself. Left empty, Caddy answers plain HTTP on port 80, for a server on the office network. Caddy keeps the `Host` header and sends `X-Forwarded-Proto`, which the cookie and `Origin` rules of ADR 0029 rely on.
- **Secrets stay in `deploy/.env`,** which the person creates from `.env.example`: `SCOPE_BOT_SECRET` and the database password are generated once and never committed. Losing `SCOPE_BOT_SECRET` makes stored API keys and channel sessions unreadable, so the guide says to keep it with the backups.
- **Until releases exist, the image is built on the server** from a clone of the repository (`docker compose up -d --build`). Publishing versioned images to GitHub's container registry belongs to the releases step, and `compose.yaml` then pulls them instead.
- **CI builds the image and starts the whole compose setup** on every pull request: it waits for the services, checks that `/` serves the page and `/health` answers through Caddy, and that the server wrote a setup code to its log. The machine this is written on has no Docker, so CI is where the image is proven.
- **The work goes in three pull requests:** the image with its CI check; the compose setup with Caddy and its CI check; the guide `docs/self-hosting.md` for installing on a VPS, setting up, updating and backing up.

## Consequences

- A server needs only Docker. A VPS with 2 CPUs and 4 GB of memory is a reasonable start; this has not been measured.
- The image has no Claude Code or Codex, so models work through API keys only, as ADR 0007 intends for anything that serves clients.
- Building on the server needs the full repository and a few minutes; published images will remove both.
- Plain HTTP on the office network leaves sessions readable on that network and keeps the microphone off in browsers, since it needs HTTPS. The guide says so.
- Backups are the PostgreSQL database plus `deploy/.env`. Nothing else in the containers holds data.
