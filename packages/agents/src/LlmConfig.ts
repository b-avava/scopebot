import { Config, Effect, Option, Redacted } from "effect"

// A line such as `LLM_MODEL=` copied from .env.example arrives as an empty
// string, which must mean the same as leaving the variable out.
const optionalString = (name: string) =>
  Config.option(Config.String(name)).pipe(Effect.map(Option.filter((value) => value.trim() !== "")))

export const llmConfig = Effect.gen(function* () {
  return {
    apiKey: (yield* optionalString("LLM_API_KEY")).pipe(Option.map(Redacted.make)),
    model: yield* optionalString("LLM_MODEL"),
    baseUrl: yield* optionalString("LLM_BASE_URL")
  }
})
