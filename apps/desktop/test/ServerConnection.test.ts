import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { ServerConnection } from "../main/ServerConnection.ts"

const withResponse = (response: Response) =>
  ServerConnection.layerNoDeps.pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, response)))
      )
    )
  )

const unreachable = ServerConnection.layerNoDeps.pipe(
  Layer.provide(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.TransportError({ request, description: "connection refused" })
          })
        )
      )
    )
  )
)

describe("ServerConnection", () => {
  it.effect("is online when the server is healthy", () =>
    Effect.gen(function* () {
      const server = yield* ServerConnection
      const status = yield* server.status
      assert.strictEqual(status.state, "online")
    }).pipe(Effect.provide(withResponse(Response.json({ status: "ok" }))))
  )

  it.effect("is offline when the server cannot be reached", () =>
    Effect.gen(function* () {
      const server = yield* ServerConnection
      const status = yield* server.status
      assert.strictEqual(status.state, "offline")
    }).pipe(Effect.provide(unreachable))
  )
})
