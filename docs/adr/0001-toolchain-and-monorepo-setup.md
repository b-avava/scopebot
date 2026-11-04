# 0001. Toolchain and monorepo setup

Date: 2026-11-04
Status: Accepted

## Context

The repository started with only the README. We need a workspace that matches the planned architecture without scaffolding packages that have no code yet. Effect v4 also differs from what the README first assumed: `@effect/rpc` is published only for v3, and RPC, HTTP and SQL primitives are now part of `effect`.

## Decision

- **pnpm workspaces** with a version catalog in `pnpm-workspace.yaml`. Effect packages are released in lockstep, so they are pinned to one exact version.
- **Effect 4.1.2.** RPC comes from `effect/rpc`, not `@effect/rpc`.
- **No build step in development.** Node 24 runs `.ts` files directly through type stripping. Workspace packages export `./src/index.ts`, and imports use explicit `.ts` extensions. `erasableSyntaxOnly` keeps the code compatible with type stripping.
- **TypeScript 7** for type checking only (`noEmit`).
- **Vitest 5**, which `@effect/vitest` 4.1 requires as a peer dependency.
- **Packages are created on demand.** The first slice is `domain` → `contracts` → `server`, proven by a `GET /health` endpoint defined with `effect/http-api`.

## Consequences

- Only erasable TypeScript is allowed: no `enum`, no parameter properties, no `namespace` with runtime code.
- Type stripping does not apply inside `node_modules`. Workspace packages work because pnpm links them and Node resolves the real path outside `node_modules`.
- A production bundle or build step still has to be chosen together with the Docker image.
- The server currently speaks plain HTTP. The typed WebSocket RPC channel for the desktop app is added with the first feature that needs it.
