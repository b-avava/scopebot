import { Authorization, CurrentSession } from "@scope-bot/contracts"
import { CurrentBusiness } from "@scope-bot/db"
import { Effect, Layer, Redacted } from "effect"
import { Auth } from "./Auth.ts"

/** Checks the session of each request, and puts everything after it inside that user's business. */
export const AuthorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const auth = yield* Auth

    return Authorization.of({
      bearer: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const token = Redacted.value(credential)
          const account = yield* auth.verify(token)
          return yield* httpEffect.pipe(
            Effect.provideService(CurrentSession, { account, token }),
            Effect.provideService(CurrentBusiness, account.businessId)
          )
        })
    })
  })
)
