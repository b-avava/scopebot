import { Config, Effect, Layer } from "effect"
import { AnthropicChatModel } from "./AnthropicChatModel.ts"
import { OpenAiCompatibleChatModel } from "./OpenAiCompatibleChatModel.ts"

/** Picks the model provider from `LLM_PROVIDER`. */
export const ConfiguredChatModel = Layer.unwrap(
  Effect.gen(function* () {
    const provider = yield* Config.String("LLM_PROVIDER").pipe(Config.withDefault("anthropic"))

    if (provider === "anthropic") return AnthropicChatModel
    if (provider === "openai-compatible") return OpenAiCompatibleChatModel
    return yield* Effect.die(new Error(`Unknown LLM_PROVIDER "${provider}". Use "anthropic" or "openai-compatible".`))
  })
)
