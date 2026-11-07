import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { ChatModel } from "../src/ChatModel.ts"
import { OpenAiCompatibleChatModel } from "../src/OpenAiCompatibleChatModel.ts"

const request = {
  model: "",
  reasoning: "default" as const,
  system: "Be kind",
  turns: [{ role: "user" as const, text: "Hi" }]
}

const makeLayer = (
  env: Record<string, string>,
  respond: () => Response,
  seen: Array<HttpClientRequest.HttpClientRequest> = []
) =>
  OpenAiCompatibleChatModel.pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((sent) => {
          seen.push(sent)
          return Effect.succeed(HttpClientResponse.fromWeb(sent, respond()))
        })
      )
    ),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
  )

const configured = { LLM_API_KEY: "key", LLM_MODEL: "some-model", LLM_BASE_URL: "https://llm.test/v1/" }

const completion = (content: string | null, finishReason = "stop") =>
  Response.json({
    model: "some-model",
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 9, completion_tokens: 4 }
  })

const reply = ChatModel.use((model) => model.reply(request))

describe("OpenAiCompatibleChatModel", () => {
  it.effect("returns the reply and its token usage", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    return Effect.gen(function* () {
      const answer = yield* reply
      assert.deepStrictEqual(answer, { text: "Hello", model: "some-model", inputTokens: 9, outputTokens: 4 })
      assert.strictEqual(seen[0]?.url, "https://llm.test/v1/chat/completions")
      assert.strictEqual(seen[0]?.headers.authorization, "Bearer key")
    }).pipe(Effect.provide(makeLayer(configured, () => completion("Hello"), seen)))
  })

  it.effect("sends reasoning only when the business chose a level", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const bodyOf = (index: number) => {
      const body = seen[index]?.body
      return body?._tag === "Uint8Array" ? new TextDecoder().decode(body.body) : ""
    }
    return Effect.gen(function* () {
      yield* reply
      yield* ChatModel.use((model) => model.reply({ ...request, reasoning: "high" }))
      assert.notInclude(bodyOf(0), "reasoning_effort")
      assert.include(bodyOf(1), '"reasoning_effort":"high"')
    }).pipe(Effect.provide(makeLayer(configured, () => completion("Hello"), seen)))
  })

  it.effect("sends photos as data URLs", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const photo = { mediaType: "image/jpeg" as const, data: "cGhvdG8=" }
    return Effect.gen(function* () {
      yield* ChatModel.use((model) =>
        model.reply({ ...request, turns: [{ role: "user", text: "Look", images: [photo] }] })
      )
      const body = seen[0]?.body
      const text = body?._tag === "Uint8Array" ? new TextDecoder().decode(body.body) : ""
      assert.include(text, "data:image/jpeg;base64,cGhvdG8=")
    }).pipe(Effect.provide(makeLayer(configured, () => completion("Hello"), seen)))
  })

  it.effect("lists chat models with free ones first, grouped by lab", () => {
    const efforts = ["low", "medium", "high"] as const
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    return Effect.gen(function* () {
      const catalog = yield* ChatModel.use((model) => model.models)
      assert.strictEqual(seen[0]?.url, "https://llm.test/v1/models")
      assert.strictEqual(catalog.defaultModel, "some-model")
      assert.deepStrictEqual(catalog.models, [
        { id: "meta/llama:free", name: "Llama", group: "meta", free: true, efforts },
        { id: "gpt-x", name: "gpt-x", group: "", free: false, efforts },
        { id: "acme/big", name: "Acme: Big", group: "acme", free: false, efforts }
      ])
    }).pipe(
      Effect.provide(
        makeLayer(
          configured,
          () =>
            Response.json({
              data: [
                { id: "acme/big", name: "Acme: Big" },
                { id: "text-embedding-3-small" },
                { id: "whisper-1" },
                { id: "gpt-x" },
                { id: "meta/llama:free", name: "Llama (free)" }
              ]
            }),
          seen
        )
      )
    )
  })

  it.effect("cannot list models without a key", () =>
    Effect.gen(function* () {
      const error = yield* ChatModel.use((model) => model.models).pipe(Effect.flip)
      assert.strictEqual(error._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer({}, () => Response.json({ data: [] }))))
  )

  it.effect("is not configured without a key", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer({ LLM_MODEL: "some-model" }, () => completion("Hello"))))
  )

  it.effect("is not configured without a model", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer({ LLM_API_KEY: "key" }, () => completion("Hello"))))
  )

  it.effect("treats empty variables from .env as unset", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    return Effect.gen(function* () {
      yield* reply
      assert.strictEqual(seen[0]?.url, "https://api.openai.com/v1/chat/completions")
    }).pipe(
      Effect.provide(
        makeLayer({ LLM_API_KEY: "key", LLM_MODEL: "some-model", LLM_BASE_URL: "" }, () => completion("Hello"), seen)
      )
    )
  })

  it.effect("treats an empty key as missing", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer({ LLM_API_KEY: "", LLM_MODEL: "some-model" }, () => completion("Hello"))))
  )

  it.effect("treats a rejected key as not configured", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer(configured, () => new Response("{}", { status: 401 }))))
  )

  it.effect("reports a content filter as a refusal", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelRefused")
    }).pipe(Effect.provide(makeLayer(configured, () => completion(null, "content_filter"))))
  )

  it.effect("fails on an empty reply", () =>
    Effect.gen(function* () {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelFailed")
    }).pipe(Effect.provide(makeLayer(configured, () => completion(""))))
  )
})
