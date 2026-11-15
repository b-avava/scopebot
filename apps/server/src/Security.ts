import { Authorization, CurrentSession } from "@scope-bot/contracts"
import { CurrentBusiness, CurrentViewer } from "@scope-bot/db"
import type { Account } from "@scope-bot/domain"
import { Effect, Layer, Redacted } from "effect"
import { Auth } from "./Auth.ts"
import { setSessionCookie } from "./WebSession.ts"

/**
 * Checks the session of each request, and puts everything after it inside that
 * user's business, seeing only that user's own in-app chats. The desktop app
 * sends a bearer token, a browser its cookie (ADR 0029).
 */
export const AuthorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const auth = yield* Auth

    const within =
      (account: Account, token: string) =>
      <A, E, R>(httpEffect: Effect.Effect<A, E, R>) =>
        httpEffect.pipe(
          Effect.provideService(CurrentSession, { account, token }),
          Effect.provideService(CurrentBusiness, account.businessId),
          Effect.provideService(CurrentViewer, {
            userId: account.user.id,
            name: account.user.name,
            seesShared: account.user.role !== "member"
          })
        )

    return Authorization.of({
      bearer: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const token = Redacted.value(credential)
          const { account } = yield* auth.verify(token)
          return yield* within(account, token)(httpEffect)
        }),
      cookie: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const token = Redacted.value(credential)
          const { account, extendedUntil } = yield* auth.verify(token)
          // The cookie ends with the session, so it moves when the session does.
          if (extendedUntil !== null) yield* setSessionCookie(token, extendedUntil)
          return yield* within(account, token)(httpEffect)
        })
    })
  })
)
