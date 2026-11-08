import { Context, Effect, Layer } from "effect"

/** The token of the signed in user. It stays in the main process, so page code can never read it. */
export class SessionToken extends Context.Service<
  SessionToken,
  {
    readonly get: Effect.Effect<string | null>
    set(token: string | null): Effect.Effect<void>
  }
>()("@scope-bot/desktop/main/SessionToken") {
  static readonly layerMemory = Layer.sync(SessionToken, () => {
    let current: string | null = null
    return SessionToken.of({
      get: Effect.sync(() => current),
      set: (token) =>
        Effect.sync(() => {
          current = token
        })
    })
  })
}
