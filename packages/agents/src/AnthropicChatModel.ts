import Anthropic from "@anthropic-ai/sdk"
import { ModelFailed, ModelNotConfigured, ModelRefused } from "@scope-bot/domain"
import { Effect, Layer, Option, Redacted } from "effect"
import { ChatModel, type ChatRequest } from "./ChatModel.ts"
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

const send = (client: Anthropic, model: string, request: ChatRequest) =>
  Effect.tryPromise({
    try: (signal) =>
      client.beta.messages.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          messages: request.turns.map((turn) => ({ role: turn.role, content: turn.text })),
          // Short conversational replies do not need deep reasoning.
          ...(supportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
          ...(supportsFallback(model)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {})
        },
        { signal }
      ),
    catch: toFailure
  })

export const AnthropicChatModel = Layer.effect(
  ChatModel,
  Effect.gen(function*() {
    const config = yield* llmConfig
    const defaultModel = Option.getOrElse(config.model, () => DEFAULT_MODEL)

    const client = Option.map(config.apiKey, (key) =>
      new Anthropic({
        apiKey: Redacted.value(key),
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES
      }))

    return ChatModel.of({
      reply: Effect.fn("ChatModel.reply")(function*(request) {
        if (Option.isNone(client)) return yield* new ModelNotConfigured()

        const response = yield* send(client.value, request.model === "" ? defaultModel : request.model, request)
        if (response.stop_reason === "refusal") return yield* new ModelRefused()

        const text = response.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("")
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
