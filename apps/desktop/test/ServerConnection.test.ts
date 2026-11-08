import { assert, describe, it } from "@effect/vitest"
import { type Account, BusinessId, UserId } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { ServerConnection } from "../main/ServerConnection.ts"
import { SessionToken } from "../main/SessionToken.ts"

const withResponse = (response: Response) =>
  ServerConnection.layerNoDeps.pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, response)))
      )
    ),
    Layer.provideMerge(SessionToken.layerMemory)
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
  ),
  Layer.provideMerge(SessionToken.layerMemory)
)

const account: Account = {
  user: {
    id: UserId.make("u"),
    email: "anna@example.com",
    name: "Anna",
    role: "owner",
    createdAt: "2026-11-07T00:00:00.000Z"
  },
  businessId: BusinessId.make("b"),
  businessName: "Northwind"
}

describe("ServerConnection", () => {
  it.effect("is online when the server is healthy", () =>
    Effect.gen(function* () {
      const server = yield* ServerConnection
      const status = yield* server.status
      assert.strictEqual(status.state, "online")
    }).pipe(Effect.provide(withResponse(Response.json({ status: "ok" }))))
  )

  it.effect("is signed out without a token, and does not ask the server", () =>
    Effect.gen(function* () {
      const server = yield* ServerConnection
      assert.deepStrictEqual(yield* server.getAccount, { ok: true, value: null })
    }).pipe(Effect.provide(unreachable))
  )

  it.effect("forgets a token the server no longer accepts", () =>
    Effect.gen(function* () {
      const token = yield* SessionToken
      const server = yield* ServerConnection
      yield* token.set("expired")

      assert.deepStrictEqual(yield* server.getAccount, { ok: true, value: null })
      assert.isNull(yield* token.get)
    }).pipe(Effect.provide(withResponse(Response.json({ _tag: "Unauthorized" }, { status: 401 }))))
  )

  it.effect("keeps the token and hands the page only the account", () =>
    Effect.gen(function* () {
      const token = yield* SessionToken
      const server = yield* ServerConnection

      const result = yield* server.login({ email: "anna@example.com", password: "a long password" })

      assert.deepStrictEqual(result, { ok: true, value: account })
      assert.strictEqual(yield* token.get, "secret-token")
    }).pipe(Effect.provide(withResponse(Response.json({ token: "secret-token", account }))))
  )

  it.effect("signs out here even when the server cannot be reached", () =>
    Effect.gen(function* () {
      const token = yield* SessionToken
      const server = yield* ServerConnection
      yield* token.set("some-token")

      assert.isTrue((yield* server.logout).ok)
      assert.isNull(yield* token.get)
    }).pipe(Effect.provide(unreachable))
  )

  it.effect("is offline when the server cannot be reached", () =>
    Effect.gen(function* () {
      const server = yield* ServerConnection
      const status = yield* server.status
      assert.strictEqual(status.state, "offline")
    }).pipe(Effect.provide(unreachable))
  )
})
