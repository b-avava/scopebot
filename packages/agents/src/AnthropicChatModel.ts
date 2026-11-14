import Anthropic from "@anthropic-ai/sdk"
import { ModelFailed, ModelNotConfigured, type ModelOption, ModelRefused } from "@scope-bot/domain"
import { Effect, Layer, Option, Redacted, Stream } from "effect"
import { ChatModel, type ChatRequest, type ChatTurn } from "./ChatModel.ts"
import { llmConfig } from "./LlmConfig.ts"

const REQUEST_TIMEOUT_MS = 60_000
const MAX_RETRIES = 2
const MAX_TOKENS = 16_000

const DEFAULT_MODEL = "claude-opus-5-5"

// The model id is free text, so request options only go to models known to accept them.
const supportsEffort = (model: string) => /^claude-(fable-5|opus-5|sonnet-5-5|haiku-5-5)/.test(model)
const supportsFallback = (model: string) => supportsEffort(model) && !model.includes("haiku")

const toFailure = (error: unknown) => {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ModelNotConfigured()
  }
  if (error instanceof Anthropic.RateLimitError) return new ModelFailed({ reason: "rate_limited" })
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ModelFailed({ reason: "timeout" })
  if (error instanceof Anthropic.APIConnectionError) return new ModelFailed({ reason: "connection" })
  if (error instanceof Anthropic.APIError) return new ModelFailed({ reason: `api_${error.status}` })
  return new ModelFailed({ reason: "unknown" })
}

const toContent = (turn: ChatTurn) =>
  turn.images === undefined
    ? turn.text
    : [
        ...turn.images.map((image) => ({
          type: "image" as const,
          source: { type: "base64" as const, media_type: image.mediaType, data: image.data }
        })),
        ...(turn.text === "" ? [] : [{ type: "text" as const, text: turn.text }])
      ]

const params = (model: string, request: ChatRequest) => ({
  model,
  max_tokens: MAX_TOKENS,
  system: request.system,
  messages: request.turns.map((turn) => ({ role: turn.role, content: toContent(turn) })),
  // Short conversational replies do not need deep reasoning unless the business asks for it.
  ...(supportsEffort(model)
    ? { output_config: { effort: request.reasoning === "default" ? ("low" as const) : request.reasoning } }
    : {}),
  ...(supportsFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {})
})

/** The same request, told to `onText` as it is written. Stopping it aborts the request. */
const sendStreaming = (
  client: Anthropic,
  model: string,
  request: ChatRequest,
  onText: (soFar: string) => Effect.Effect<void>
) =>
  Effect.suspend(() => {
    const controller = new AbortController()
    const stream = client.beta.messages.stream(params(model, request), { signal: controller.signal })
    let soFar = ""
    return Stream.fromAsyncIterable(stream, toFailure).pipe(
      Stream.runForEach((event) => {
        if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") return Effect.void
        soFar += event.delta.text
        return onText(soFar)
      }),
      Effect.andThen(Effect.tryPromise({ try: () => stream.finalMessage(), catch: toFailure })),
      Effect.onInterrupt(() => Effect.sync(() => controller.abort()))
    )
  })

const send = (client: Anthropic, model: string, request: ChatRequest) =>
  Effect.tryPromise({
    try: (signal) => client.beta.messages.create(params(model, request), { signal }),
    catch: toFailure
  })

const listModels = (client: Anthropic) =>
  Effect.tryPromise({
    try: async (signal) => {
      const models: Array<ModelOption> = []
      for await (const model of client.models.list(null, { signal })) {
        if (model.lifecycle !== "retired") {
          models.push({
            id: model.id,
            name: model.display_name,
            group: "",
            free: false,
            efforts: supportsEffort(model.id) ? ["low", "medium", "high"] : []
          })
        }
      }
      return models
    },
    catch: toFailure
  })

export const AnthropicChatModel = Layer.effect(
  ChatModel,
  Effect.gen(function* () {
    const config = yield* llmConfig
    const defaultModel = Option.getOrElse(config.model, () => DEFAULT_MODEL)

    const client = Option.map(
      config.apiKey,
      (key) =>
        new Anthropic({
          apiKey: Redacted.value(key),
          timeout: REQUEST_TIMEOUT_MS,
          maxRetries: MAX_RETRIES
        })
    )

    return ChatModel.of({
      models: Effect.gen(function* () {
        if (Option.isNone(client)) return yield* new ModelNotConfigured()
        return { defaultModel, models: yield* listModels(client.value) }
      }),
      reply: Effect.fn("ChatModel.reply")(function* (request) {
        if (Option.isNone(client)) return yield* new ModelNotConfigured()

        const model = request.model === "" ? defaultModel : request.model
        const response =
          request.onText === undefined
            ? yield* send(client.value, model, request)
            : yield* sendStreaming(client.value, model, request, request.onText)
        if (response.stop_reason === "refusal") return yield* new ModelRefused()

        const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
        if (text === "") return yield* new ModelFailed({ reason: "empty_reply" })

        return {
          text,
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      })
    })
  })
)
