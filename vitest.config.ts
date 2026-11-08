import { existsSync } from "node:fs"
import { defineConfig } from "vitest/config"

// Tests of real storage need TEST_DATABASE_URL. CI sets it in the workflow.
if (existsSync(".env")) process.loadEnvFile(".env")

export default defineConfig({
  test: {
    include: ["apps/*/test/**/*.test.ts", "packages/*/test/**/*.test.ts"]
  }
})
