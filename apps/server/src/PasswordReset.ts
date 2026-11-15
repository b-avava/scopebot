import { randomBytes } from "node:crypto"
import { Accounts } from "@scope-bot/db"
import { normalizeEmail, UserNotFound } from "@scope-bot/domain"
import { Effect, Option } from "effect"
import { hashPassword } from "./Passwords.ts"

/** 18 random bytes make 24 characters, well above the shortest password the app accepts. */
const PASSWORD_BYTES = 18

/**
 * Gives a person a new random password, for whoever runs the server (ADR 0028).
 * The person is signed out on every device, and their failed logins are forgotten.
 */
export const resetPassword = Effect.fn("resetPassword")(function* (email: string) {
  const accounts = yield* Accounts
  const address = normalizeEmail(email)
  const found = yield* accounts.findLogin(address)
  if (Option.isNone(found)) return yield* Effect.fail(new UserNotFound())
  const id = found.value.account.user.id
  const password = randomBytes(PASSWORD_BYTES).toString("base64url")
  yield* accounts.savePassword(id, yield* hashPassword(password))
  yield* accounts.removeOtherSessions(id, null)
  yield* accounts.clearFailures(address)
  return password
})
