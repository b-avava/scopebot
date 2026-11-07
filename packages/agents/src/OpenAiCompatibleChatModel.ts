import { ModelFailed, ModelNotConfigured, type ModelOption, ModelRefused } from "@scope-bot/domain"
import { Effect, Layer, Option, Redacted, Schedule, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import { ChatModel, type ChatTurn } from "./ChatModel.ts"
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

const ModelList = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optionalKey(Schema.NullOr(Schema.String))
    })
  )
})

// `/models` lists everything the key can reach, and only some of it can chat.
const NOT_FOR_CHAT = /embed|whisper|tts|dall-e|moderation|image|audio|realtime|transcribe|sora|babbage|davinci/i

const toOption = (model: (typeof ModelList.Type)["data"][number]): ModelOption => {
  const separator = model.id.indexOf("/")
  return {
    id: model.id,
    name: (model.name ?? model.id).replace(/\s*\(free\)$/i, ""),
    group: separator === -1 ? "" : model.id.slice(0, separator),
    free: model.id.endsWith(":free"),
    efforts: ["low", "medium", "high"]
  }
}

/** Free models first, then each lab together. */
const byFreeThenGroup = (first: ModelOption, second: ModelOption) =>
  Number(second.free) - Number(first.free) ||
  first.group.localeCompare(second.group) ||
  first.name.localeCompare(second.name)

const toContent = (turn: ChatTurn) =>
  turn.images === undefined
    ? turn.text
    : [
        ...(turn.text === "" ? [] : [{ type: "text", text: turn.text }]),
        ...turn.images.map((image) => ({
          type: "image_url",
          image_url: { url: `data:${image.mediaType};base64,${image.data}` }
        }))
      ]

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

interface OpenAiCompatibleOptions {
  readonly apiKey: Option.Option<Redacted.Redacted<string>>
  readonly baseUrl: string
  readonly defaultModel: string
}

/** One provider with an OpenAI-style `/chat/completions` endpoint. */
export const openAiCompatibleModel = (
  httpClient: HttpClient.HttpClient,
  { apiKey, baseUrl, defaultModel }: OpenAiCompatibleOptions
) => {
  const client = httpClient.pipe(HttpClient.retryTransient({ schedule: Schedule.exponential("500 millis"), times: 2 }))
  const url = (path: string) => `${baseUrl.replace(/\/$/, "")}${path}`

  return ChatModel.of({
    models: Effect.gen(function* () {
      if (Option.isNone(apiKey)) return yield* new ModelNotConfigured()

      const response = yield* HttpClientRequest.get(url("/models")).pipe(
        HttpClientRequest.bearerToken(Redacted.value(apiKey.value)),
        client.execute,
        Effect.timeout("20 seconds"),
        Effect.mapError(() => new ModelFailed({ reason: "connection" }))
      )

      if (response.status < 200 || response.status >= 300) return yield* failureFor(response.status)

      const list = yield* HttpClientResponse.schemaBodyJson(ModelList)(response).pipe(
        Effect.mapError(() => new ModelFailed({ reason: "invalid_response" }))
      )

      return {
        defaultModel,
        models: list.data
          .filter((model) => !NOT_FOR_CHAT.test(model.id))
          .map(toOption)
          .sort(byFreeThenGroup)
      }
    }),
    reply: Effect.fn("ChatModel.reply")(function* (request) {
      const model = request.model === "" ? defaultModel : request.model
      if (Option.isNone(apiKey) || model === "") return yield* new ModelNotConfigured()

      const response = yield* HttpClientRequest.post(url("/chat/completions")).pipe(
        HttpClientRequest.bearerToken(Redacted.value(apiKey.value)),
        HttpClientRequest.bodyJsonUnsafe({
          model,
          // Not every model takes this, so it is only sent when the business asked for it.
          ...(request.reasoning === "default" ? {} : { reasoning_effort: request.reasoning }),
          messages: [
            { role: "system", content: request.system },
            ...request.turns.map((turn) => ({ role: turn.role, content: toContent(turn) }))
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
}

/**
 * The provider from `.env`: OpenAI, OpenRouter, DeepSeek, Groq, Mistral and
 * others. Set `LLM_BASE_URL` and `LLM_MODEL` for the provider.
 */
export const OpenAiCompatibleChatModel = Layer.effect(
  ChatModel,
  Effect.gen(function* () {
    const { apiKey, baseUrl, model } = yield* llmConfig
    return openAiCompatibleModel(yield* HttpClient.HttpClient, {
      apiKey,
      baseUrl: Option.getOrElse(baseUrl, () => "https://api.openai.com/v1"),
      defaultModel: Option.getOrElse(model, () => "")
    })
  })
)
