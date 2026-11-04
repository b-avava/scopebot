import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { ChatModel } from "../src/ChatModel.ts"
import { OpenAiCompatibleChatModel } from "../src/OpenAiCompatibleChatModel.ts"

const request = { model: "", system: "Be kind", turns: [{ role: "user" as const, text: "Hi" }] }

const makeLayer = (
  env: Record<string, string>,
  respond: () => Response,
  seen: Array<HttpClientRequest.HttpClientRequest> = []
) =>
  OpenAiCompatibleChatModel.pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((sent) => {
        seen.push(sent)
        return Effect.succeed(HttpClientResponse.fromWeb(sent, respond()))
      })
    )),
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
    return Effect.gen(function*() {
      const answer = yield* reply
      assert.deepStrictEqual(answer, { text: "Hello", model: "some-model", inputTokens: 9, outputTokens: 4 })
      assert.strictEqual(seen[0]?.url, "https://llm.test/v1/chat/completions")
      assert.strictEqual(seen[0]?.headers["authorization"], "Bearer key")
    }).pipe(Effect.provide(makeLayer(configured, () => completion("Hello"), seen)))
  })

  it.effect("is not configured without a key", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer({ LLM_MODEL: "some-model" }, () => completion("Hello")))))

  it.effect("is not configured without a model", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer({ LLM_API_KEY: "key" }, () => completion("Hello")))))

  it.effect("treats empty variables from .env as unset", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    return Effect.gen(function*() {
      yield* reply
      assert.strictEqual(seen[0]?.url, "https://api.openai.com/v1/chat/completions")
    }).pipe(Effect.provide(makeLayer(
      { LLM_API_KEY: "key", LLM_MODEL: "some-model", LLM_BASE_URL: "" },
      () => completion("Hello"),
      seen
    )))
  })

  it.effect("treats an empty key as missing", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer({ LLM_API_KEY: "", LLM_MODEL: "some-model" }, () => completion("Hello")))))

  it.effect("treats a rejected key as not configured", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelNotConfigured")
    }).pipe(Effect.provide(makeLayer(configured, () => new Response("{}", { status: 401 })))))

  it.effect("reports a content filter as a refusal", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelRefused")
    }).pipe(Effect.provide(makeLayer(configured, () => completion(null, "content_filter")))))

  it.effect("fails on an empty reply", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* reply.pipe(Effect.flip))._tag, "ModelFailed")
    }).pipe(Effect.provide(makeLayer(configured, () => completion("")))))
})
