import { assert, describe, it, layer } from "@effect/vitest"
import { Deals } from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Accounts, pgStoreLayer } from "@scope-bot/db"
import { testDatabaseLayer } from "@scope-bot/db/testing"
import { Effect, Layer, Option } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { Auth } from "../src/Auth.ts"
import { AuthApiHandlers } from "../src/Http.ts"
import { resetPassword } from "../src/PasswordReset.ts"
import { makeSetupCode, Signup, sameSetupCode } from "../src/Signup.ts"
import { TestAuthorization } from "./support.ts"

const setupCode = "ABCD-EFGH-JKMN"

/** A new server with sign-up closed, on a database of its own (ADR 0028). */
const server = Layer.mergeAll(AuthApiHandlers, TestAuthorization, HttpServer.layerServices).pipe(
  Layer.provideMerge(Auth.layer),
  Layer.provide(Signup.layer({ open: false, setupCode })),
  Layer.provide(Deals.layer),
  Layer.provide(pgStoreLayer),
  Layer.provideMerge(Accounts.layer),
  Layer.provideMerge(testDatabaseLayer)
)

const makeClient = HttpApiTest.groups(Api, ["auth"])

const password = "correct horse battery"

const owner = (email: string, code?: string) => ({
  businessName: "Northwind",
  name: "Owner",
  email,
  password,
  ...(code === undefined ? {} : { setupCode: code })
})

describe("setup codes", () => {
  it.effect("are 12 characters that are easy to read, typed in any case", () =>
    Effect.gen(function* () {
      const code = yield* makeSetupCode
      assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
      assert.notStrictEqual(code, yield* makeSetupCode)
      assert.isTrue(sameSetupCode(` ${code.toLowerCase().replaceAll("-", "")} `, code))
      assert.isFalse(sameSetupCode("ABCD-EFGH-JKMP", setupCode))
    })
  )
})

// Each step builds on the one before: a new server, its setup, then a closed door.
layer(server, { timeout: "60 seconds", excludeTestServices: true })("Setup", (it) => {
  it.effect("sets up a new server once, with the code from its log, then closes sign-up", () =>
    Effect.gen(function* () {
      const client = yield* makeClient

      assert.deepStrictEqual(yield* client.auth.options(), { needsSetup: true, signupOpen: false })

      const missing = yield* client.auth.register({ payload: owner("first@example.com") }).pipe(Effect.flip)
      const wrong = yield* client.auth
        .register({ payload: owner("first@example.com", "ABCD-EFGH-JKMP") })
        .pipe(Effect.flip)
      assert.deepStrictEqual([missing._tag, wrong._tag], ["SetupCodeInvalid", "SetupCodeInvalid"])

      // Two people with the code at once, one of them typing it in lower case: only one becomes the owner.
      const outcome = (email: string, code: string) =>
        client.auth
          .register({ payload: owner(email, code) })
          .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "owner" }))
      const outcomes = yield* Effect.all(
        [outcome("first@example.com", setupCode), outcome("second@example.com", "abcdefghjkmn")],
        { concurrency: "unbounded" }
      )
      assert.sameMembers(outcomes, ["owner", "SignupClosed"])

      assert.deepStrictEqual(yield* client.auth.options(), { needsSetup: false, signupOpen: false })
      const again = yield* client.auth.register({ payload: owner("third@example.com", setupCode) }).pipe(Effect.flip)
      assert.strictEqual(again._tag, "SignupClosed")

      const email = outcomes[0] === "owner" ? "first@example.com" : "second@example.com"
      const session = yield* client.auth.login({ payload: { email, password } })
      assert.strictEqual(session.account.user.role, "owner")
      assert.strictEqual(session.account.businessName, "Northwind")
    })
  )

  it.effect("resets a forgotten password and signs the person out everywhere", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const auth = yield* Auth
      const accounts = yield* Accounts
      const email = Option.isSome(yield* accounts.findLogin("first@example.com"))
        ? "first@example.com"
        : "second@example.com"
      const session = yield* client.auth.login({ payload: { email, password } })
      yield* Effect.forEach(Array.from({ length: 10 }), () => accounts.recordFailure(email))

      const next = yield* resetPassword(` ${email.toUpperCase()} `)

      assert.isAtLeast(next.length, 20)
      assert.strictEqual((yield* auth.verify(session.token).pipe(Effect.flip))._tag, "Unauthorized")
      const old = yield* client.auth.login({ payload: { email, password } }).pipe(Effect.flip)
      assert.strictEqual(old._tag, "WrongCredentials", "Failed logins were cleared, so the limit does not answer")
      yield* client.auth.login({ payload: { email, password: next } })

      const unknown = yield* resetPassword("nobody@example.com").pipe(Effect.flip)
      assert.strictEqual(unknown._tag, "UserNotFound")
    })
  )
})
