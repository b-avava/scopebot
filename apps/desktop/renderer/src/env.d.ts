/// <reference types="vite/client" />

import type { ScopeBotBridge } from "../../preload/bridge.ts"

declare global {
  interface Window {
    readonly scopeBot: ScopeBotBridge
  }
}
