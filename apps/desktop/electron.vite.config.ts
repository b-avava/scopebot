import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "electron-vite"
import { resolve } from "node:path"

const root = import.meta.dirname

// Terminals inside Electron-based tools can leak this variable, and it makes
// the app start as plain Node with no `electron` API.
delete process.env["ELECTRON_RUN_AS_NODE"]

export default defineConfig({
  main: {
    build: {
      // Workspace packages export TypeScript sources, so they must be bundled.
      externalizeDeps: { exclude: ["@scope-bot/contracts", "@scope-bot/domain"] },
      rolldownOptions: {
        input: { index: resolve(root, "main/index.ts") }
      }
    }
  },
  preload: {
    build: {
      rolldownOptions: {
        input: { index: resolve(root, "preload/index.ts") },
        // Sandboxed preload scripts cannot be ES modules.
        output: { format: "cjs", entryFileNames: "[name].cjs" }
      }
    }
  },
  renderer: {
    root: resolve(root, "renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      // beUI sources import each other through the `@/` alias.
      alias: { "@": resolve(root, "../../packages/ui/src") }
    },
    build: {
      // Keeps fonts as files, so the page CSP does not need to allow `data:`.
      assetsInlineLimit: 0,
      rolldownOptions: {
        input: { index: resolve(root, "renderer/index.html") }
      }
    }
  }
})
