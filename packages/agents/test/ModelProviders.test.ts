import { assert, describe, it } from "@effect/vitest"
import { ProviderKeys } from "@scope-bot/db"
import { Effect, Layer, Option, Redacted } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { ChatModel } from "../src/ChatModel.ts"
import { CliUnavailable, LocalCli } from "../src/LocalCli.ts"
import { ModelProviders } from "../src/ModelProviders.ts"

const makeLayer = (seen: Array<HttpClientRequest.HttpClientRequest>) =>
  ModelProviders.layer.pipe(
    Layer.provideMerge(ProviderKeys.layerMemory),
    Layer.provide(
      Layer.succeed(
        ChatModel,
        ChatModel.of({
          models: Effect.succeed({ defaultModel: "", models: [] }),
          reply: () => Effect.die("not used")
        })
      )
    ),
    Layer.provide(
      Layer.succeed(
        LocalCli,
        LocalCli.of({
          run: () => Effect.fail(new CliUnavailable()),
          inEmptyFolder: (_system, _images, use) =>
            use({ path: "/empty", systemFile: "/empty/system.txt", imageFiles: [] })
        })
      )
    ),
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((sent) => {
          seen.push(sent)
          return Effect.succeed(
            HttpClientResponse.fromWeb(sent, Response.json({ data: [{ id: "lab/model", name: "Lab: Model" }] }))
          )
        })
      )
    )
  )

const find = (id: string) =>
  ModelProviders.use((providers) => providers.list).pipe(
    Effect.map((list) => list.find((provider) => provider.id === id))
  )

describe("ModelProviders", () => {
  it.effect("connects a provider as soon as its key is saved, and forgets it when removed", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    return Effect.gen(function* () {
      const providers = yield* ModelProviders

      assert.strictEqual((yield* find("openrouter"))?.status, "signed-out")

      yield* providers.saveKey("openrouter", { key: "secret-key" })
      const connected = yield* find("openrouter")
      assert.strictEqual(connected?.status, "connected")
      assert.isTrue(connected?.hasKey)
      assert.strictEqual(connected?.models[0]?.group, "lab")
      assert.notInclude(JSON.stringify(connected), "secret-key")
      assert.strictEqual(seen[0]?.url, "https://openrouter.ai/api/v1/models")
      assert.strictEqual(seen[0]?.headers.authorization, "Bearer secret-key")

      yield* providers.removeKey("openrouter")
      assert.strictEqual((yield* find("openrouter"))?.status, "signed-out")
    }).pipe(Effect.provide(makeLayer(seen)))
  })

  it.effect("calls a custom provider at the address it was given", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    return Effect.gen(function* () {
      const providers = yield* ModelProviders
      yield* providers.saveKey("custom", { key: "k", baseUrl: "https://llm.example/v1/" })

      assert.strictEqual((yield* find("custom"))?.status, "connected")
      assert.strictEqual(seen[0]?.url, "https://llm.example/v1/models")
    }).pipe(Effect.provide(makeLayer(seen)))
  })

  it.effect("keeps keys readable only through the service", () =>
    Effect.gen(function* () {
      const keys = yield* ProviderKeys
      yield* keys.save("deepseek", { key: "abc" })

      const stored = yield* keys.get("deepseek")
      assert.isTrue(Option.isSome(stored))
      assert.strictEqual(Option.isSome(stored) ? Redacted.value(stored.value.key) : "", "abc")
      assert.notInclude(String(Option.getOrThrow(stored).key), "abc")
    }).pipe(Effect.provide(ProviderKeys.layerMemory))
  )

  it.effect("cannot sign in to a provider that only takes a key", () =>
    Effect.gen(function* () {
      const providers = yield* ModelProviders
      const failure = yield* providers.login("openrouter").pipe(Effect.flip)
      assert.strictEqual(failure._tag, "ProviderLoginFailed")
    }).pipe(Effect.provide(makeLayer([])))
  )
})
