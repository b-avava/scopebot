import { AgentChat, Agents } from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"

export const SystemApiHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function*(handlers) {
    return handlers.handleAll({
      health: () => Effect.succeed({ status: "ok" as const })
    })
  })
)

export const BusinessApiHandlers = HttpApiBuilder.group(
  Api,
  "business",
  Effect.fn(function*(handlers) {
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
  Effect.fn(function*(handlers) {
    const agents = yield* Agents

    return handlers.handleAll({
      list: () => agents.list,
      create: ({ payload }) => agents.create(payload),
      update: ({ params, payload }) => agents.update(params.id, payload),
      remove: ({ params }) => agents.remove(params.id)
    })
  })
)

export const ChatApiHandlers = HttpApiBuilder.group(
  Api,
  "chat",
  Effect.fn(function*(handlers) {
    const chat = yield* AgentChat

    return handlers.handleAll({
      messages: ({ params }) => chat.messages(params.id),
      send: ({ params, payload }) => chat.send(params.id, payload.text),
      actions: ({ params }) => chat.actions(params.id),
      state: ({ params }) => chat.state(params.id),
      resume: ({ params }) => chat.resume(params.id)
    })
  })
)

export const ApiHandlers = Layer.mergeAll(SystemApiHandlers, BusinessApiHandlers, AgentsApiHandlers, ChatApiHandlers)

export const ApiRoutes = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json"
}).pipe(Layer.provide(ApiHandlers))
