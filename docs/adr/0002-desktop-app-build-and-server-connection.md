# 0002. Desktop app build and server connection

Date: 2026-11-04
Status: Accepted

## Context

The desktop app has three separately built parts (main, preload, renderer) with different runtimes. The renderer must stay sandboxed, and the README requires a thin main process that owns the server connection.

## Decision

- **electron-vite + Vite + `@vitejs/plugin-react`** build all three parts with one command and give the renderer hot reload. Plain Vite would need hand-written process management for the same result.
- **Layout follows the README:** `apps/desktop/main`, `preload` and `renderer`.
- **Security defaults:** `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, a Content-Security-Policy in the page, and navigation and new windows are denied.
- **The sandboxed preload is built as CommonJS** (`index.cjs`), because sandboxed preload scripts cannot be ES modules.
- **The server connection lives in the main process** (`ServerConnection`, an Effect service using the shared `contracts` API). The renderer reaches it only through the typed `window.scopeBot` bridge and never talks to the server directly.
- **Workspace packages are bundled into main,** because they export TypeScript sources. Other dependencies stay external.

## Consequences

- Every new capability for the renderer needs an explicit method on `ScopeBotBridge`.
- `install-electron` runs before `dev` and `preview`, because Electron downloads its binary lazily and electron-vite requires it to exist already.
- `electron.vite.config.ts` clears `ELECTRON_RUN_AS_NODE`, which terminals inside Electron-based tools can leak.
- Packaging, code signing and auto-update are not set up yet.
