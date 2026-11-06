import { Api } from "@scope-bot/contracts"
import { AgentId, AgentSettings, BusinessProfile, CreateAgent, SendMessage } from "@scope-bot/domain"
import { Config, Context, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import type { BridgeError, BridgeResult, ScopeBotBridge, ServerStatus } from "../preload/bridge.ts"

type Bridged<K extends keyof ScopeBotBridge> = ScopeBotBridge[K] extends (...args: infer _) => Promise<infer R>
  ? Effect.Effect<R>
  : never

const errorCodes: Record<string, BridgeError> = {
  SchemaError: "invalid",
  AgentNotFound: "not-found",
  AgentPaused: "paused",
  ModelNotConfigured: "model-not-configured",
  ModelRefused: "model-refused",
  ModelFailed: "model-failed"
}

const toResult = <A, E extends { readonly _tag: string }>(
  effect: Effect.Effect<A, E>
): Effect.Effect<BridgeResult<A>> =>
  effect.pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error) => Effect.succeed({ ok: false as const, error: errorCodes[error._tag] ?? "offline" }))
  )

// Everything below comes from the renderer, so it is validated before use.
const decodeId = Schema.decodeUnknownEffect(AgentId)
const decodeCreate = Schema.decodeUnknownEffect(CreateAgent)
const decodeSettings = Schema.decodeUnknownEffect(AgentSettings)
const decodeMessage = Schema.decodeUnknownEffect(SendMessage)
const decodeBusiness = Schema.decodeUnknownEffect(BusinessProfile)

export class ServerConnection extends Context.Service<
  ServerConnection,
  {
    readonly status: Effect.Effect<ServerStatus>
    readonly getBusiness: Bridged<"getBusiness">
    saveBusiness(business: unknown): Bridged<"saveBusiness">
    readonly listAgents: Bridged<"listAgents">
    createAgent(input: unknown): Bridged<"createAgent">
    updateAgent(id: unknown, settings: unknown): Bridged<"updateAgent">
    removeAgent(id: unknown): Bridged<"removeAgent">
    listMessages(id: unknown): Bridged<"listMessages">
    sendMessage(id: unknown, text: unknown): Bridged<"sendMessage">
    listActions(id: unknown): Bridged<"listActions">
    getChatState(id: unknown): Bridged<"getChatState">
    resumeAgent(id: unknown): Bridged<"resumeAgent">
    readonly listModels: Bridged<"listModels">
  }
>()("@scope-bot/desktop/main/ServerConnection") {
  static readonly layerNoDeps = Layer.effect(
    ServerConnection,
    Effect.gen(function* () {
      const url = yield* Config.String("SCOPE_BOT_SERVER_URL").pipe(Config.withDefault("http://127.0.0.1:3000"))
      const client = yield* HttpApiClient.make(Api, {
        transformClient: HttpClient.mapRequest(HttpClientRequest.prependUrl(url))
      })

      const status = client.system.health().pipe(
        Effect.timeout("2 seconds"),
        Effect.as<ServerStatus>({ state: "online", url }),
        Effect.catch(() => Effect.succeed<ServerStatus>({ state: "offline", url }))
      )

      return ServerConnection.of({
        status,
        getBusiness: toResult(client.business.get()),
        saveBusiness: (business) =>
          toResult(decodeBusiness(business).pipe(Effect.flatMap((payload) => client.business.save({ payload })))),
        listAgents: toResult(client.agents.list()),
        createAgent: (input) =>
          toResult(decodeCreate(input).pipe(Effect.flatMap((payload) => client.agents.create({ payload })))),
        updateAgent: (id, settings) =>
          toResult(
            Effect.gen(function* () {
              const params = { id: yield* decodeId(id) }
              return yield* client.agents.update({ params, payload: yield* decodeSettings(settings) })
            })
          ),
        removeAgent: (id) =>
          toResult(
            decodeId(id).pipe(
              Effect.flatMap((id) => client.agents.remove({ params: { id } })),
              Effect.asVoid
            )
          ),
        listMessages: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.messages({ params: { id } })))),
        sendMessage: (id, text) =>
          toResult(
            Effect.gen(function* () {
              const params = { id: yield* decodeId(id) }
              return yield* client.chat.send({ params, payload: yield* decodeMessage({ text }) })
            })
          ),
        listActions: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.actions({ params: { id } })))),
        getChatState: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.state({ params: { id } })))),
        resumeAgent: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.resume({ params: { id } })))),
        listModels: toResult(client.models.list())
      })
    })
  )

  static readonly layer = ServerConnection.layerNoDeps.pipe(Layer.provide(FetchHttpClient.layer))
}
