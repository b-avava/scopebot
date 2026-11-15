import { assert, describe, it } from "@effect/vitest"
import { type Account, BusinessId, UserId } from "@scope-bot/domain"
import { Effect } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { makeApiConnection } from "../client/ApiConnection.ts"

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

/** A server that answers every request the same way, and remembers what it was asked. */
const fakeServer = (answer: () => Response) => {
  const seen: Array<HttpClientRequest.HttpClientRequest> = []
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      seen.push(request)
      return HttpClientResponse.fromWeb(request, answer())
    })
  )
  return { seen, client }
}

// What a browser does (ADR 0029). The desktop side is in ServerConnection.test.ts.
const inBrowser = (answer: () => Response) => {
  const server = fakeServer(answer)
  const connection = makeApiConnection({ url: "https://crm.example.com", session: { kind: "cookie" } }).pipe(
    Effect.provideService(HttpClient.HttpClient, server.client)
  )
  return { server, connection }
}

describe("ApiConnection in a browser", () => {
  it.effect("signs in through /auth/web and sends no token of its own", () =>
    Effect.gen(function* () {
      const { server, connection } = inBrowser(() => Response.json(account))
      const api = yield* connection

      const result = yield* api.login({ email: "anna@example.com", password: "a long password" })

      assert.deepStrictEqual(result, { ok: true, value: account })
      assert.deepStrictEqual(
        server.seen.map((request) => [request.method, request.url]),
        [["POST", "https://crm.example.com/auth/web/login"]]
      )
      assert.isUndefined(server.seen[0]?.headers.authorization)
    })
  )

  it.effect("asks the server who is signed in, since the page cannot see the cookie", () =>
    Effect.gen(function* () {
      const signedIn = inBrowser(() => Response.json(account))
      assert.deepStrictEqual(yield* (yield* signedIn.connection).getAccount, { ok: true, value: account })
      assert.strictEqual(signedIn.server.seen[0]?.url, "https://crm.example.com/account")

      const signedOut = inBrowser(() => Response.json({ _tag: "Unauthorized" }, { status: 401 }))
      assert.deepStrictEqual(yield* (yield* signedOut.connection).getAccount, { ok: true, value: null })
    })
  )

  it.effect("signs out on the server, which deletes the cookie", () =>
    Effect.gen(function* () {
      const { server, connection } = inBrowser(() => new Response(null, { status: 204 }))

      assert.isTrue((yield* (yield* connection).logout).ok)
      assert.deepStrictEqual(
        server.seen.map((request) => [request.method, request.url]),
        [["POST", "https://crm.example.com/account/logout"]]
      )
    })
  )
})
