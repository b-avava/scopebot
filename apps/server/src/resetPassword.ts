import { NodeRuntime } from "@effect/platform-node"
import { Accounts, databaseLayer } from "@scope-bot/db"
import { Config, Console, Effect, Layer } from "effect"
import { resetPassword } from "./PasswordReset.ts"

const fail = (message: string) => Effect.die(new Error(message))

/** `pnpm user:reset-password <email>`: a new password for a person who forgot theirs. */
const program = Effect.gen(function* () {
  const email = process.argv[2]?.trim() ?? ""
  if (email === "") return yield* fail("Usage: pnpm user:reset-password <email>")
  const password = yield* resetPassword(email).pipe(
    Effect.catchTag("UserNotFound", () => fail(`No account uses ${email}`))
  )
  yield* Console.log(`New password for ${email}: ${password}`)
  yield* Console.log("They were signed out on every device. They can change it under Account once signed in.")
})

const Database = Layer.unwrap(Config.Redacted("DATABASE_URL").pipe(Effect.map(databaseLayer)))

program.pipe(Effect.provide(Accounts.layer.pipe(Layer.provide(Database))), NodeRuntime.runMain)
