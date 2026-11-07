import { AgentChat, Agents, ModelProviders } from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"

export const SystemApiHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function* (handlers) {
    return handlers.handleAll({
      health: () => Effect.succeed({ status: "ok" as const })
    })
  })
)

export const BusinessApiHandlers = HttpApiBuilder.group(
  Api,
  "business",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents

    return handlers.handleAll({
      get: () => agents.business,
      save: ({ payload }) => agents.saveBusiness(payload)
    })
  })
)

export const AgentsApiHandlers = HttpApiBuilder.group(
  Api,
  "agents",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents

    return handlers.handleAll({
      list: () => agents.list,
      lastMessages: () => agents.lastMessages,
      create: ({ payload }) => agents.create(payload),
      update: ({ params, payload }) => agents.update(params.id, payload),
      pin: ({ params, payload }) => agents.pin(params.id, payload.pinned),
      remove: ({ params }) => agents.remove(params.id)
    })
  })
)

export const ChatApiHandlers = HttpApiBuilder.group(
  Api,
  "chat",
  Effect.fn(function* (handlers) {
    const chat = yield* AgentChat

    return handlers.handleAll({
      conversations: ({ params }) => chat.conversations(params.id),
      createConversation: ({ params }) => chat.createConversation(params.id),
      renameConversation: ({ params, payload }) =>
        chat.renameConversation(params.id, params.conversationId, payload.title),
      removeConversation: ({ params }) => chat.removeConversation(params.id, params.conversationId),
      messages: ({ params }) => chat.messages(params.id, params.conversationId),
      send: ({ params, payload }) => chat.send(params.id, params.conversationId, payload.text, payload.images),
      ask: ({ params, payload }) => chat.ask(params.id, params.conversationId, payload.text),
      actions: ({ params }) => chat.actions(params.id),
      state: ({ params }) => chat.state(params.id, params.conversationId),
      resume: ({ params }) => chat.resume(params.id, params.conversationId)
    })
  })
)

export const SearchApiHandlers = HttpApiBuilder.group(
  Api,
  "search",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents

    return handlers.handleAll({
      run: ({ query }) => agents.search(query.q)
    })
  })
)

export const ModelsApiHandlers = HttpApiBuilder.group(
  Api,
  "models",
  Effect.fn(function* (handlers) {
    const providers = yield* ModelProviders

    return handlers.handleAll({
      list: () => providers.list
    })
  })
)

export const ProvidersApiHandlers = HttpApiBuilder.group(
  Api,
  "providers",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents
    const providers = yield* ModelProviders

    return handlers.handleAll({
      preferences: () => agents.preferences,
      savePreferences: ({ payload }) => agents.savePreferences(payload),
      saveKey: ({ params, payload }) => providers.saveKey(params.id, payload),
      removeKey: ({ params }) => providers.removeKey(params.id),
      login: ({ params }) => providers.login(params.id)
    })
  })
)

export const ApiHandlers = Layer.mergeAll(
  SystemApiHandlers,
  BusinessApiHandlers,
  AgentsApiHandlers,
  ChatApiHandlers,
  SearchApiHandlers,
  ModelsApiHandlers,
  ProvidersApiHandlers
)

export const ApiRoutes = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json"
}).pipe(Layer.provide(ApiHandlers))
