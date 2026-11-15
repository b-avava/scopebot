import { makeWebBridge } from "./WebBridge.ts"

// During development Vite serves the page and passes /api to the server. Built, the server serves both.
const apiUrl = `${window.location.origin}${import.meta.env.DEV ? "/api" : ""}`

// Read-only, as Electron's contextBridge makes it, so page code cannot swap it.
Object.defineProperty(window, "scopeBot", { value: makeWebBridge(apiUrl), writable: false, configurable: false })

// No window controls in a browser, so the strip that holds them goes away.
document.documentElement.classList.add("in-browser")
