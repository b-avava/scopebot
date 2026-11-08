import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { app, safeStorage } from "electron"
import { SessionToken } from "./SessionToken.ts"

/**
 * Keeps the session across restarts, encrypted with the key of the operating
 * system account. Where the system cannot encrypt, the token stays in memory
 * and the person signs in on each launch.
 */
export const StoredSessionToken = Layer.sync(SessionToken, () => {
  const filePath = () => join(app.getPath("userData"), "session")
  let current: string | null | undefined

  const read = () => {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(filePath())) return null
    try {
      return safeStorage.decryptString(readFileSync(filePath()))
    } catch {
      // Written under another system account. Signing in again replaces it.
      return null
    }
  }

  return SessionToken.of({
    get: Effect.sync(() => {
      current ??= read()
      return current
    }),
    set: (token) =>
      Effect.sync(() => {
        current = token
        if (token === null) rmSync(filePath(), { force: true })
        else if (safeStorage.isEncryptionAvailable()) writeFileSync(filePath(), safeStorage.encryptString(token))
      })
  })
})
