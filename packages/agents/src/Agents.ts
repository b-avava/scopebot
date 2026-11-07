import { Store } from "@scope-bot/db"
import {
  type Agent,
  AgentId,
  AgentNotFound,
  type AgentSettings,
  type BusinessProfile,
  ConversationId,
  type CreateAgent,
  defaultSettings,
  type LastMessage,
  NEW_CHAT_TITLE,
  type ProviderPreferences,
  type SearchHit
} from "@scope-bot/domain"
import { Clock, Context, Effect, Layer, Option } from "effect"
import { searchEverything } from "./Search.ts"

export const nowIso = Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis).toISOString()))

/** Managing agents. Humans and, later, other agents go through this service. */
export class Agents extends Context.Service<
  Agents,
  {
    readonly list: Effect.Effect<ReadonlyArray<Agent>>
    get(id: AgentId): Effect.Effect<Agent, AgentNotFound>
    create(input: CreateAgent): Effect.Effect<Agent>
    update(id: AgentId, settings: AgentSettings): Effect.Effect<Agent, AgentNotFound>
    pin(id: AgentId, pinned: boolean): Effect.Effect<Agent, AgentNotFound>
    /** The newest message of each employee, across its chats. */
    readonly lastMessages: Effect.Effect<ReadonlyArray<LastMessage>>
    /** Looks through every employee, chat and message. */
    search(query: string): Effect.Effect<ReadonlyArray<SearchHit>>
    remove(id: AgentId): Effect.Effect<void, AgentNotFound>
    readonly business: Effect.Effect<BusinessProfile>
    saveBusiness(business: BusinessProfile): Effect.Effect<BusinessProfile>
    readonly preferences: Effect.Effect<ProviderPreferences>
    savePreferences(preferences: ProviderPreferences): Effect.Effect<ProviderPreferences>
  }
>()("@scope-bot/agents/Agents") {
  static readonly layer = Layer.effect(
    Agents,
    Effect.gen(function* () {
      const store = yield* Store

      const get = (id: AgentId) =>
        store.findAgent(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new AgentNotFound()),
              onSome: Effect.succeed
            })
          )
        )

      return Agents.of({
        list: store.agents,
        get,
        create: Effect.fn("Agents.create")(function* (input) {
          const agent: Agent = {
            ...defaultSettings(input),
            id: AgentId.make(crypto.randomUUID()),
            pinned: false,
            createdAt: yield* nowIso
          }
          yield* store.saveAgent(agent)
          yield* store.saveConversation({
            id: ConversationId.make(agent.id),
            agentId: agent.id,
            title: NEW_CHAT_TITLE,
            createdAt: agent.createdAt
          })
          return agent
        }),
        update: Effect.fn("Agents.update")(function* (id, settings) {
          const updated: Agent = { ...(yield* get(id)), ...settings }
          yield* store.saveAgent(updated)
          return updated
        }),
        pin: Effect.fn("Agents.pin")(function* (id, pinned) {
          const updated: Agent = { ...(yield* get(id)), pinned }
          yield* store.saveAgent(updated)
          return updated
        }),
        lastMessages: Effect.gen(function* () {
          const agents = yield* store.agents
          const found = yield* Effect.forEach(agents, (agent) =>
            store.messages(agent.id).pipe(
              Effect.map((messages) => messages.findLast((message) => message.role !== "note")),
              Effect.map(
                (message): ReadonlyArray<LastMessage> =>
                  message === undefined
                    ? []
                    : [
                        {
                          agentId: agent.id,
                          text: message.text === "" ? "Photo" : message.text,
                          createdAt: message.createdAt
                        }
                      ]
              )
            )
          )
          return found.flat()
        }),
        search: Effect.fn("Agents.search")(function* (query) {
          const agents = yield* store.agents
          const conversations = yield* Effect.forEach(agents, (agent) => store.conversations(agent.id))
          const messages = yield* Effect.forEach(agents, (agent) => store.messages(agent.id))
          return searchEverything({ agents, conversations: conversations.flat(), messages: messages.flat() }, query)
        }),
        remove: Effect.fn("Agents.remove")(function* (id) {
          yield* get(id)
          yield* store.removeAgent(id)
        }),
        business: store.business,
        saveBusiness: (business) => store.saveBusiness(business).pipe(Effect.as(business)),
        preferences: store.preferences,
        savePreferences: (preferences) => store.savePreferences(preferences).pipe(Effect.as(preferences))
      })
    })
  )
}
