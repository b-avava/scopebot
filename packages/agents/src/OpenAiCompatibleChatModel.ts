import { ModelFailed, ModelNotConfigured, ModelRefused } from "@scope-bot/domain"
import { Effect, Layer, Option, Redacted, Schedule, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { ChatModel } from "./ChatModel.ts"
import { llmConfig } from "./LlmConfig.ts"

const Completion = Schema.Struct({
  model: Schema.optionalKey(Schema.String),
  choices: Schema.Array(
    Schema.Struct({
      message: Schema.Struct({ content: Schema.NullOr(Schema.String) }),
      finish_reason: Schema.optionalKey(Schema.NullOr(Schema.String))
    })
  ),
  usage: Schema.optionalKey(
    Schema.Struct({
      prompt_tokens: Schema.Number,
      completion_tokens: Schema.Number
    })
  )
})

const failureFor = (status: number) => {
  if (status === 401 || status === 403) return new ModelNotConfigured()
  if (status === 429) return new ModelFailed({ reason: "rate_limited" })
  return new ModelFailed({ reason: `api_${status}` })
}

const toReply = (completion: typeof Completion.Type, model: string) => {
  const choice = completion.choices[0]
  if (choice?.finish_reason === "content_filter") return Effect.fail(new ModelRefused())

  const text = choice?.message.content ?? ""
  if (text === "") return Effect.fail(new ModelFailed({ reason: "empty_reply" }))

  return Effect.succeed({
    text,
    model: completion.model ?? model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0
  })
}

/**
 * Any provider with an OpenAI-style `/chat/completions` endpoint: OpenAI,
 * OpenRouter, DeepSeek, Groq, Mistral and others. Set `LLM_BASE_URL` and
 * `LLM_MODEL` for the provider.
 */
export const OpenAiCompatibleChatModel = Layer.effect(
  ChatModel,
  Effect.gen(function* () {
    const { apiKey, baseUrl: configuredUrl, model: configuredModel } = yield* llmConfig
    const defaultModel = Option.getOrElse(configuredModel, () => "")
    const baseUrl = Option.getOrElse(configuredUrl, () => "https://api.openai.com/v1")
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient({ schedule: Schedule.exponential("500 millis"), times: 2 })
    )

    return ChatModel.of({
      reply: Effect.fn("ChatModel.reply")(function* (request) {
        const model = request.model === "" ? defaultModel : request.model
        if (Option.isNone(apiKey) || model === "") return yield* new ModelNotConfigured()

        const response = yield* HttpClientRequest.post(`${baseUrl.replace(/\/$/, "")}/chat/completions`).pipe(
          HttpClientRequest.bearerToken(Redacted.value(apiKey.value)),
          HttpClientRequest.bodyJsonUnsafe({
            model,
            messages: [
              { role: "system", content: request.system },
              ...request.turns.map((turn) => ({ role: turn.role, content: turn.text }))
            ]
          }),
          client.execute,
          Effect.timeout("60 seconds"),
          Effect.mapError(() => new ModelFailed({ reason: "connection" }))
        )

        if (response.status < 200 || response.status >= 300) return yield* failureFor(response.status)

        const completion = yield* HttpClientResponse.schemaBodyJson(Completion)(response).pipe(
          Effect.mapError(() => new ModelFailed({ reason: "invalid_response" }))
        )

        return yield* toReply(completion, model)
      })
    })
  })
)
