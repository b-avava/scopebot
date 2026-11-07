import { Api } from "@scope-bot/contracts"
import {
  AgentId,
  AgentSettings,
  BusinessProfile,
  ConversationId,
  CreateAgent,
  PinAgent,
  ProviderId,
  ProviderKey,
  ProviderPreferences,
  RenameConversation,
  SendMessage,
  SideQuestion
} from "@scope-bot/domain"
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
  ModelFailed: "model-failed",
  ConversationNotFound: "not-found",
  ConversationRequired: "invalid",
  ProviderLoginFailed: "provider-login-failed"
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
const decodeConversation = Schema.decodeUnknownEffect(ConversationId)
const decodeRename = Schema.decodeUnknownEffect(RenameConversation)

const chatParams = (id: unknown, conversationId: unknown) =>
  Effect.all({ id: decodeId(id), conversationId: decodeConversation(conversationId) })
const decodeCreate = Schema.decodeUnknownEffect(CreateAgent)
const decodeSettings = Schema.decodeUnknownEffect(AgentSettings)
const decodeMessage = Schema.decodeUnknownEffect(SendMessage)
const decodeQuestion = Schema.decodeUnknownEffect(SideQuestion)
const decodeBusiness = Schema.decodeUnknownEffect(BusinessProfile)
const decodePin = Schema.decodeUnknownEffect(PinAgent)
const decodeQuery = Schema.decodeUnknownEffect(Schema.String)
const decodeProvider = Schema.decodeUnknownEffect(ProviderId)
const decodeKey = Schema.decodeUnknownEffect(ProviderKey)
const decodePreferences = Schema.decodeUnknownEffect(ProviderPreferences)

export class ServerConnection extends Context.Service<
  ServerConnection,
  {
    readonly status: Effect.Effect<ServerStatus>
    readonly getBusiness: Bridged<"getBusiness">
    saveBusiness(business: unknown): Bridged<"saveBusiness">
    readonly listAgents: Bridged<"listAgents">
    readonly listLastMessages: Bridged<"listLastMessages">
    createAgent(input: unknown): Bridged<"createAgent">
    updateAgent(id: unknown, settings: unknown): Bridged<"updateAgent">
    removeAgent(id: unknown): Bridged<"removeAgent">
    pinAgent(id: unknown, pinned: unknown): Bridged<"pinAgent">
    search(query: unknown): Bridged<"search">
    listConversations(id: unknown): Bridged<"listConversations">
    createConversation(id: unknown): Bridged<"createConversation">
    renameConversation(id: unknown, conversationId: unknown, title: unknown): Bridged<"renameConversation">
    removeConversation(id: unknown, conversationId: unknown): Bridged<"removeConversation">
    listMessages(id: unknown, conversationId: unknown): Bridged<"listMessages">
    sendMessage(id: unknown, conversationId: unknown, text: unknown, images: unknown): Bridged<"sendMessage">
    askAgent(id: unknown, conversationId: unknown, text: unknown): Bridged<"askAgent">
    listActions(id: unknown): Bridged<"listActions">
    getChatState(id: unknown, conversationId: unknown): Bridged<"getChatState">
    resumeAgent(id: unknown, conversationId: unknown): Bridged<"resumeAgent">
    readonly listModels: Bridged<"listModels">
    readonly getPreferences: Bridged<"getPreferences">
    savePreferences(preferences: unknown): Bridged<"savePreferences">
    saveProviderKey(id: unknown, input: unknown): Bridged<"saveProviderKey">
    removeProviderKey(id: unknown): Bridged<"removeProviderKey">
    loginProvider(id: unknown): Bridged<"loginProvider">
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
        listLastMessages: toResult(client.agents.lastMessages()),
        createAgent: (input) =>
          toResult(decodeCreate(input).pipe(Effect.flatMap((payload) => client.agents.create({ payload })))),
        updateAgent: (id, settings) =>
          toResult(
            Effect.gen(function* () {
              const params = { id: yield* decodeId(id) }
              return yield* client.agents.update({ params, payload: yield* decodeSettings(settings) })
            })
          ),
        pinAgent: (id, pinned) =>
          toResult(
            Effect.gen(function* () {
              const params = { id: yield* decodeId(id) }
              return yield* client.agents.pin({ params, payload: yield* decodePin({ pinned }) })
            })
          ),
        search: (query) =>
          toResult(decodeQuery(query).pipe(Effect.flatMap((q) => client.search.run({ query: { q } })))),
        removeAgent: (id) =>
          toResult(
            decodeId(id).pipe(
              Effect.flatMap((id) => client.agents.remove({ params: { id } })),
              Effect.asVoid
            )
          ),
        listConversations: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.conversations({ params: { id } })))),
        createConversation: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.createConversation({ params: { id } })))),
        renameConversation: (id, conversationId, title) =>
          toResult(
            Effect.gen(function* () {
              const params = yield* chatParams(id, conversationId)
              return yield* client.chat.renameConversation({ params, payload: yield* decodeRename({ title }) })
            })
          ),
        removeConversation: (id, conversationId) =>
          toResult(
            chatParams(id, conversationId).pipe(
              Effect.flatMap((params) => client.chat.removeConversation({ params })),
              Effect.asVoid
            )
          ),
        listMessages: (id, conversationId) =>
          toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.messages({ params })))),
        sendMessage: (id, conversationId, text, images) =>
          toResult(
            Effect.gen(function* () {
              const params = yield* chatParams(id, conversationId)
              return yield* client.chat.send({ params, payload: yield* decodeMessage({ text, images }) })
            })
          ),
        askAgent: (id, conversationId, text) =>
          toResult(
            Effect.gen(function* () {
              const params = yield* chatParams(id, conversationId)
              return yield* client.chat.ask({ params, payload: yield* decodeQuestion({ text }) })
            })
          ),
        listActions: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.actions({ params: { id } })))),
        getChatState: (id, conversationId) =>
          toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.state({ params })))),
        resumeAgent: (id, conversationId) =>
          toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.resume({ params })))),
        listModels: toResult(client.models.list()),
        getPreferences: toResult(client.providers.preferences()),
        savePreferences: (preferences) =>
          toResult(
            decodePreferences(preferences).pipe(
              Effect.flatMap((payload) => client.providers.savePreferences({ payload }))
            )
          ),
        saveProviderKey: (id, input) =>
          toResult(
            Effect.gen(function* () {
              const params = { id: yield* decodeProvider(id) }
              yield* client.providers.saveKey({ params, payload: yield* decodeKey(input) })
            })
          ),
        removeProviderKey: (id) =>
          toResult(
            decodeProvider(id).pipe(
              Effect.flatMap((id) => client.providers.removeKey({ params: { id } })),
              Effect.asVoid
            )
          ),
        loginProvider: (id) =>
          toResult(
            decodeProvider(id).pipe(
              Effect.flatMap((id) => client.providers.login({ params: { id } })),
              Effect.asVoid
            )
          )
      })
    })
  )

  static readonly layer = ServerConnection.layerNoDeps.pipe(Layer.provide(FetchHttpClient.layer))
}
