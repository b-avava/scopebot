import { ProviderKeys } from "@scope-bot/db"
import {
  type ModelFailed,
  ModelNotConfigured,
  type ModelRefused,
  type ProviderCatalog,
  type ProviderId,
  type ProviderKey,
  ProviderLoginFailed
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { HttpClient } from "effect/http"
import { ChatModel, type ChatReply, type ChatRequest } from "./ChatModel.ts"
import { makeClaudeCodeProvider } from "./ClaudeCodeProvider.ts"
import { makeCodexProvider } from "./CodexProvider.ts"
import { LocalCli } from "./LocalCli.ts"
import { openAiCompatibleModel } from "./OpenAiCompatibleChatModel.ts"

const CATALOG_TTL = "30 seconds"

export interface ChatProvider {
  /** Never fails: a provider that cannot be used says so in its status. */
  readonly catalog: Effect.Effect<ProviderCatalog>
  reply(request: ChatRequest): Effect.Effect<ChatReply, ModelNotConfigured | ModelFailed | ModelRefused>
  /** Providers with a browser sign in. */
  readonly login?: Effect.Effect<void, ProviderLoginFailed>
}

const base = {
  id: "api",
  name: "API key",
  detail: "From .env",
  account: "",
  hasKey: true,
  defaultModel: "",
  models: []
} as const

const apiProvider = (model: ChatModel["Service"]): ChatProvider => ({
  catalog: model.models.pipe(
    Effect.map((catalog): ProviderCatalog => ({ ...base, status: "connected", hint: "", ...catalog })),
    Effect.catch((failure) =>
      Effect.succeed<ProviderCatalog>(
        failure._tag === "ModelFailed"
          ? { ...base, status: "failed", hint: `The provider did not return its models (${failure.reason}).` }
          : { ...base, hasKey: false, status: "signed-out", hint: "Set LLM_API_KEY in .env and restart the server." }
      )
    )
  ),
  reply: model.reply
})

interface KeyProviderOptions {
  readonly id: ProviderId
  readonly name: string
  /** Empty when the person has to give the address. */
  readonly url: string
}

const keyProviders: ReadonlyArray<KeyProviderOptions> = [
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { id: "deepseek", name: "DeepSeek", url: "https://api.deepseek.com/v1" },
  { id: "custom", name: "Custom provider", url: "" }
]

/** A provider with an OpenAI-style API, reached with a key added in the app. */
const makeKeyProvider = (
  options: KeyProviderOptions,
  keys: ProviderKeys["Service"],
  client: HttpClient.HttpClient
): ChatProvider => {
  const empty = { id: options.id, name: options.name, account: "", defaultModel: "", models: [] } as const

  const modelFor = keys.get(options.id).pipe(
    Effect.map(
      Option.map(({ key, baseUrl }) => ({
        url: baseUrl === "" ? options.url : baseUrl,
        model: openAiCompatibleModel(client, {
          apiKey: Option.some(key),
          baseUrl: baseUrl === "" ? options.url : baseUrl,
          defaultModel: ""
        })
      }))
    )
  )

  return {
    catalog: modelFor.pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.succeed<ProviderCatalog>({
              ...empty,
              detail: "",
              hasKey: false,
              status: "signed-out",
              hint: "Add an API key."
            }),
          onSome: ({ url, model }) =>
            model.models.pipe(
              Effect.map(
                (catalog): ProviderCatalog => ({
                  ...empty,
                  detail: url,
                  hasKey: true,
                  status: "connected",
                  hint: "",
                  ...catalog
                })
              ),
              Effect.catch((failure) =>
                Effect.succeed<ProviderCatalog>({
                  ...empty,
                  detail: url,
                  hasKey: true,
                  status: "failed",
                  hint:
                    failure._tag === "ModelFailed"
                      ? `The provider did not return its models (${failure.reason}).`
                      : "The provider rejected this key."
                })
              )
            )
        })
      )
    ),
    reply: (request) =>
      modelFor.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new ModelNotConfigured()),
            onSome: ({ model }) => model.reply(request)
          })
        )
      )
  }
}

const make = (providers: Partial<Record<ProviderId, ChatProvider>>, keys: ProviderKeys["Service"]) =>
  Effect.gen(function* () {
    const [list, invalidate] = yield* Effect.cachedInvalidateWithTTL(
      Effect.all(
        Object.values(providers).map((provider) => provider.catalog),
        { concurrency: "unbounded" }
      ),
      CATALOG_TTL
    )

    return ModelProviders.of({
      list,
      reply: (provider, request) => providers[provider]?.reply(request) ?? Effect.fail(new ModelNotConfigured()),
      saveKey: (provider, input) => keys.save(provider, input).pipe(Effect.andThen(invalidate)),
      removeKey: (provider) => keys.remove(provider).pipe(Effect.andThen(invalidate)),
      login: (provider) =>
        (providers[provider]?.login ?? Effect.fail(new ProviderLoginFailed())).pipe(Effect.andThen(invalidate))
    })
  })

/** Every place a model can run, and the one door to reach them. */
export class ModelProviders extends Context.Service<
  ModelProviders,
  {
    readonly list: Effect.Effect<ReadonlyArray<ProviderCatalog>>
    reply(
      provider: ProviderId,
      request: ChatRequest
    ): Effect.Effect<ChatReply, ModelNotConfigured | ModelFailed | ModelRefused>
    saveKey(provider: ProviderId, input: ProviderKey): Effect.Effect<void>
    removeKey(provider: ProviderId): Effect.Effect<void>
    /** Opens the provider's sign in and waits for the person to finish. */
    login(provider: ProviderId): Effect.Effect<void, ProviderLoginFailed>
  }
>()("@scope-bot/agents/ModelProviders") {
  static readonly layer = Layer.effect(
    ModelProviders,
    Effect.gen(function* () {
      const model = yield* ChatModel
      const cli = yield* LocalCli
      const keys = yield* ProviderKeys
      const client = yield* HttpClient.HttpClient
      return yield* make(
        {
          "claude-code": makeClaudeCodeProvider(cli, keys),
          codex: makeCodexProvider(cli, keys),
          api: apiProvider(model),
          ...Object.fromEntries(keyProviders.map((options) => [options.id, makeKeyProvider(options, keys, client)]))
        },
        keys
      )
    })
  )

  /** Only the key in `.env`, without touching the machine's CLIs. */
  static readonly layerApiOnly = Layer.effect(
    ModelProviders,
    Effect.gen(function* () {
      return yield* make({ api: apiProvider(yield* ChatModel) }, yield* ProviderKeys)
    })
  ).pipe(Layer.provide(ProviderKeys.layerMemory))
}
