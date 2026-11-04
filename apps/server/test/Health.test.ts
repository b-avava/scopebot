import { assert, layer } from "@effect/vitest"
import { Api } from "@scope-bot/contracts"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { SystemApiHandlers } from "../src/Http.ts"

const makeClient = HttpApiTest.groups(Api, ["system"])

layer(Layer.mergeAll(SystemApiHandlers, HttpServer.layerServices))("SystemApi", (it) => {
  it.effect("reports a healthy server", () =>
    Effect.gen(function*() {
      const client = yield* makeClient
      const health = yield* client.system.health()
      assert.deepStrictEqual(health, { status: "ok" })
    }))
})
