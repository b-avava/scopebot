import { Config, Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { type ApiConnection, makeApiConnection } from "../client/ApiConnection.ts"
import { SessionToken } from "./SessionToken.ts"

/** The server, as the main process sees it. The token stays here, so page code can never read it. */
export class ServerConnection extends Context.Service<ServerConnection, ApiConnection>()(
  "@scope-bot/desktop/main/ServerConnection"
) {
  static readonly layerNoDeps = Layer.effect(
    ServerConnection,
    Effect.gen(function* () {
      const url = yield* Config.String("SCOPE_BOT_SERVER_URL").pipe(Config.withDefault("http://127.0.0.1:3000"))
      const store = yield* SessionToken
      return ServerConnection.of(yield* makeApiConnection({ url, session: { kind: "token", store } }))
    })
  )

  static readonly layer = ServerConnection.layerNoDeps.pipe(Layer.provide(FetchHttpClient.layer))
}
