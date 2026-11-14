import { Store } from "@scope-bot/db"
import {
  type Agent,
  AgentId,
  AgentNotFound,
  type AgentSettings,
  type AgentState,
  type AgentStatus,
  type BusinessProfile,
  ConversationId,
  type CreateAgent,
  DepartmentNotFound,
  defaultSettings,
  type LastMessage,
  NEW_CHAT_TITLE,
  type ProviderPreferences,
  type SearchHit
} from "@scope-bot/domain"
import { Clock, Context, Effect, Layer, Option } from "effect"
import { searchEverything } from "./Search.ts"
import { isWithinHours } from "./WorkingHours.ts"

export const nowIso = Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis).toISOString()))

/** The first that applies wins, in the order of `AgentState`. */
export const stateOf = (
  agent: Agent,
  now: Date,
  facts: { readonly waiting: boolean; readonly handedOver: boolean }
): AgentState => {
  if (!agent.active) return "paused"
  if (facts.waiting) return "approval"
  if (facts.handedOver) return "with-person"
  return isWithinHours(agent.hours, now) ? "working" : "after-hours"
}

/** Managing agents. Humans and, later, other agents go through this service. */
export class Agents extends Context.Service<
  Agents,
  {
    readonly list: Effect.Effect<ReadonlyArray<Agent>>
    get(id: AgentId): Effect.Effect<Agent, AgentNotFound>
    create(input: CreateAgent): Effect.Effect<Agent>
    update(id: AgentId, settings: AgentSettings): Effect.Effect<Agent, AgentNotFound | DepartmentNotFound>
    pin(id: AgentId, pinned: boolean): Effect.Effect<Agent, AgentNotFound>
    /** What each employee is doing now, for its avatar. */
    readonly statuses: Effect.Effect<ReadonlyArray<AgentStatus>>
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
            role: input.role ?? null,
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
          const existing = yield* get(id)
          if (settings.departmentId !== null && Option.isNone(yield* store.findDepartment(settings.departmentId))) {
            return yield* Effect.fail(new DepartmentNotFound())
          }
          const updated: Agent = { ...existing, ...settings }
          yield* store.saveAgent(updated)
          return updated
        }),
        pin: Effect.fn("Agents.pin")(function* (id, pinned) {
          const updated: Agent = { ...(yield* get(id)), pinned }
          yield* store.saveAgent(updated)
          return updated
        }),
        statuses: Effect.gen(function* () {
          const now = new Date(yield* Clock.currentTimeMillis)
          const approvals = yield* store.approvals
          const escalations = yield* store.openEscalations
          // A reply drafted for a customer waits for a person like any approval.
          const drafting = (yield* store.channelChats("whatsapp")).filter((chat) => chat.drafts > 0)
          return (yield* store.agents).map((agent) => ({
            agentId: agent.id,
            state: stateOf(agent, now, {
              waiting:
                approvals.some((item) => item.agentId === agent.id && item.status === "pending") ||
                drafting.some((chat) => chat.conversation.agentId === agent.id),
              handedOver: escalations.some((item) => item.agentId === agent.id)
            })
          }))
        }),
        lastMessages: store.lastMessages.pipe(
          Effect.map((messages) =>
            messages.map((message) => ({ ...message, text: message.text === "" ? "Photo" : message.text }))
          )
        ),
        search: Effect.fn("Agents.search")(function* (query) {
          const agents = yield* store.agents
          const conversations = yield* Effect.forEach(agents, (agent) => store.conversations(agent.id))
          const messages = yield* store.searchMessages(query.trim())
          return searchEverything({ agents, conversations: conversations.flat(), messages }, query)
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
