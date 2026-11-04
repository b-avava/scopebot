import { Store } from "@scope-bot/db"
import {
  type Agent,
  AgentId,
  AgentNotFound,
  type AgentSettings,
  type BusinessProfile,
  type CreateAgent,
  defaultSettings
} from "@scope-bot/domain"
import { Clock, Context, Effect, Layer, Option } from "effect"

export const nowIso = Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis).toISOString()))

/** Managing agents. Humans and, later, other agents go through this service. */
export class Agents extends Context.Service<Agents, {
  readonly list: Effect.Effect<ReadonlyArray<Agent>>
  get(id: AgentId): Effect.Effect<Agent, AgentNotFound>
  create(input: CreateAgent): Effect.Effect<Agent>
  update(id: AgentId, settings: AgentSettings): Effect.Effect<Agent, AgentNotFound>
  remove(id: AgentId): Effect.Effect<void, AgentNotFound>
  readonly business: Effect.Effect<BusinessProfile>
  saveBusiness(business: BusinessProfile): Effect.Effect<BusinessProfile>
}>()("@scope-bot/agents/Agents") {
  static readonly layer = Layer.effect(
    Agents,
    Effect.gen(function*() {
      const store = yield* Store

      const get = (id: AgentId) =>
        store.findAgent(id).pipe(
          Effect.flatMap(Option.match({
            onNone: () => Effect.fail(new AgentNotFound()),
            onSome: Effect.succeed
          }))
        )

      return Agents.of({
        list: store.agents,
        get,
        create: Effect.fn("Agents.create")(function*(input) {
          const agent: Agent = {
            ...defaultSettings(input),
            id: AgentId.make(crypto.randomUUID()),
            createdAt: yield* nowIso
          }
          yield* store.saveAgent(agent)
          return agent
        }),
        update: Effect.fn("Agents.update")(function*(id, settings) {
          const updated: Agent = { ...(yield* get(id)), ...settings }
          yield* store.saveAgent(updated)
          return updated
        }),
        remove: Effect.fn("Agents.remove")(function*(id) {
          yield* get(id)
          yield* store.removeAgent(id)
        }),
        business: store.business,
        saveBusiness: (business) => store.saveBusiness(business).pipe(Effect.as(business))
      })
    })
  )
}
