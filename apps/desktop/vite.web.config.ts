import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

const root = import.meta.dirname

/**
 * The interface for a browser (ADR 0029): the same renderer with `web/` putting the
 * bridge in place. During development the page and the API share one address,
 * because /api goes on to the server, so the session cookie works as it will built.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(root, "../.."), "")
  const server = env.SCOPE_BOT_SERVER_URL || "http://127.0.0.1:3000"

  return {
    root: resolve(root, "web"),
    plugins: [react(), tailwindcss()],
    resolve: {
      // beUI sources import each other through the `@/` alias.
      alias: { "@": resolve(root, "../../packages/ui/src") }
    },
    server: {
      // The desktop app's renderer runs on 5173.
      port: 5174,
      strictPort: true,
      proxy: {
        // The Host header stays this page's, so the server's Origin check sees one site.
        "/api": { target: server, rewrite: (path) => path.replace(/^\/api/, "") }
      }
    },
    build: {
      outDir: resolve(root, "dist/web"),
      emptyOutDir: true,
      // Keeps fonts as files, so the page CSP does not need to allow `data:`.
      assetsInlineLimit: 0
    }
  }
})
