import {
  Agent,
  AgentAction,
  type AgentId,
  BusinessProfile,
  ChatMessage,
  Conversation,
  type ConversationId,
  defaultSettings,
  Escalation,
  emptyBusinessProfile,
  emptyProviderPreferences,
  ProviderPreferences
} from "@scope-bot/domain"
import { Context, Effect, FileSystem, Layer, Option, Path, Schema, Semaphore } from "effect"

const Data = Schema.Struct({
  business: BusinessProfile,
  agents: Schema.Array(Agent),
  conversations: Schema.Array(Conversation),
  messages: Schema.Array(ChatMessage),
  actions: Schema.Array(AgentAction),
  escalations: Schema.Array(Escalation),
  preferences: ProviderPreferences
})
type Data = typeof Data.Type

const emptyData: Data = {
  business: emptyBusinessProfile,
  agents: [],
  conversations: [],
  messages: [],
  actions: [],
  escalations: [],
  preferences: emptyProviderPreferences
}

const decodeData = Schema.decodeUnknownEffect(Data)
const encodeData = Schema.encodeEffect(Data)

const validShapes: ReadonlyArray<string> = [
  "circle",
  "pebble",
  "squircle",
  "capsule",
  "triangle",
  "hexagon",
  "cloud",
  "droplet"
]

type Stored = Record<string, unknown>

const list = (value: unknown): ReadonlyArray<Stored> => (Array.isArray(value) ? value : [])

/** Before tabs, an agent had one chat. It became the chat that shares the agent's id. */
const inFirstChat = (stored: Stored) => ({ conversationId: stored.agentId, ...stored })

/** Brings a file written by an earlier version up to the current format. */
const upgrade = (raw: Stored) => ({
  ...emptyData,
  ...raw,
  conversations: Array.isArray(raw.conversations)
    ? raw.conversations
    : list(raw.agents).map((agent) => ({
        id: agent.id,
        agentId: agent.id,
        title: "Chat",
        createdAt: agent.createdAt
      })),
  messages: list(raw.messages).map(inFirstChat),
  escalations: list(raw.escalations).map(inFirstChat),
  agents: (Array.isArray(raw.agents) ? raw.agents : []).map((stored: Record<string, unknown>) => ({
    ...defaultSettings({
      name: String(stored.name),
      job: String(stored.job),
      color: String(stored.color),
      shape: "circle",
      face: "neutral"
    }),
    ...stored,
    pinned: stored.pinned === true,
    shape: validShapes.includes(String(stored.shape)) ? stored.shape : "circle",
    backupModels: (Array.isArray(stored.backupModels) ? stored.backupModels : []).map((backup: unknown) =>
      typeof backup === "string" ? { provider: "api", model: backup } : backup
    )
  }))
})

/**
 * Storage used by the domain services. The file-backed layer is a stand-in
 * until PostgreSQL is available (see docs/adr/0004). Only this service knows
 * how data is stored.
 */
export class Store extends Context.Service<
  Store,
  {
    readonly business: Effect.Effect<BusinessProfile>
    saveBusiness(business: BusinessProfile): Effect.Effect<void>
    readonly agents: Effect.Effect<ReadonlyArray<Agent>>
    findAgent(id: AgentId): Effect.Effect<Option.Option<Agent>>
    saveAgent(agent: Agent): Effect.Effect<void>
    /** Also removes the agent's chats, messages, actions and escalations. */
    removeAgent(id: AgentId): Effect.Effect<void>
    conversations(agentId: AgentId): Effect.Effect<ReadonlyArray<Conversation>>
    findConversation(id: ConversationId): Effect.Effect<Option.Option<Conversation>>
    saveConversation(conversation: Conversation): Effect.Effect<void>
    /** Also removes its messages and escalations. The audit log stays. */
    removeConversation(id: ConversationId): Effect.Effect<void>
    messages(agentId: AgentId): Effect.Effect<ReadonlyArray<ChatMessage>>
    appendMessage(message: ChatMessage): Effect.Effect<void>
    actions(agentId: AgentId): Effect.Effect<ReadonlyArray<AgentAction>>
    appendAction(action: AgentAction): Effect.Effect<void>
    openEscalation(conversationId: ConversationId): Effect.Effect<Option.Option<Escalation>>
    appendEscalation(escalation: Escalation): Effect.Effect<void>
    resolveEscalation(conversationId: ConversationId, resolvedAt: string): Effect.Effect<void>
    readonly preferences: Effect.Effect<ProviderPreferences>
    savePreferences(preferences: ProviderPreferences): Effect.Effect<void>
  }
>()("@scope-bot/db/Store") {
  static readonly layerMemory = Layer.effect(
    Store,
    Effect.suspend(() => make(emptyData, () => Effect.void))
  )

  static readonly layerFile = (filePath: string) =>
    Layer.effect(
      Store,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path

        yield* fs.makeDirectory(path.dirname(filePath), { recursive: true })

        const initial = (yield* fs.exists(filePath))
          ? yield* fs.readFileString(filePath).pipe(
              Effect.map((json) => upgrade(JSON.parse(json))),
              Effect.flatMap(decodeData)
            )
          : emptyData

        const temporaryPath = `${filePath}.tmp`
        const persist = (data: Data) =>
          encodeData(data).pipe(
            Effect.flatMap((encoded) => fs.writeFileString(temporaryPath, JSON.stringify(encoded))),
            // Renaming keeps the previous file intact if a write is interrupted.
            Effect.andThen(fs.rename(temporaryPath, filePath)),
            Effect.orDie
          )

        return yield* make(initial, persist)
      })
    )
}

const make = (initial: Data, persist: (data: Data) => Effect.Effect<void>) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1)
    let data = initial

    const update = (change: (current: Data) => Data) =>
      Semaphore.withPermit(
        lock,
        Effect.suspend(() => {
          const next = change(data)
          return persist(next).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                data = next
              })
            )
          )
        })
      )

    return Store.of({
      business: Effect.sync(() => data.business),
      saveBusiness: (business) => update((current) => ({ ...current, business })),
      agents: Effect.sync(() => data.agents),
      findAgent: (id) => Effect.sync(() => Option.fromNullishOr(data.agents.find((agent) => agent.id === id))),
      saveAgent: (agent) =>
        update((current) => ({
          ...current,
          agents: current.agents.some((existing) => existing.id === agent.id)
            ? current.agents.map((existing) => (existing.id === agent.id ? agent : existing))
            : [...current.agents, agent]
        })),
      removeAgent: (id) =>
        update((current) => ({
          ...current,
          agents: current.agents.filter((agent) => agent.id !== id),
          conversations: current.conversations.filter((conversation) => conversation.agentId !== id),
          messages: current.messages.filter((message) => message.agentId !== id),
          actions: current.actions.filter((action) => action.agentId !== id),
          escalations: current.escalations.filter((escalation) => escalation.agentId !== id)
        })),
      conversations: (agentId) =>
        Effect.sync(() => data.conversations.filter((conversation) => conversation.agentId === agentId)),
      findConversation: (id) =>
        Effect.sync(() => Option.fromNullishOr(data.conversations.find((conversation) => conversation.id === id))),
      saveConversation: (conversation) =>
        update((current) => ({
          ...current,
          conversations: current.conversations.some((existing) => existing.id === conversation.id)
            ? current.conversations.map((existing) => (existing.id === conversation.id ? conversation : existing))
            : [...current.conversations, conversation]
        })),
      removeConversation: (id) =>
        update((current) => ({
          ...current,
          conversations: current.conversations.filter((conversation) => conversation.id !== id),
          messages: current.messages.filter((message) => message.conversationId !== id),
          escalations: current.escalations.filter((escalation) => escalation.conversationId !== id)
        })),
      messages: (agentId) => Effect.sync(() => data.messages.filter((message) => message.agentId === agentId)),
      appendMessage: (message) => update((current) => ({ ...current, messages: [...current.messages, message] })),
      actions: (agentId) => Effect.sync(() => data.actions.filter((action) => action.agentId === agentId)),
      appendAction: (action) => update((current) => ({ ...current, actions: [...current.actions, action] })),
      openEscalation: (conversationId) =>
        Effect.sync(() =>
          Option.fromNullishOr(
            data.escalations.find(
              (escalation) => escalation.conversationId === conversationId && escalation.resolvedAt === null
            )
          )
        ),
      appendEscalation: (escalation) =>
        update((current) => ({ ...current, escalations: [...current.escalations, escalation] })),
      preferences: Effect.sync(() => data.preferences),
      savePreferences: (preferences) => update((current) => ({ ...current, preferences })),
      resolveEscalation: (conversationId, resolvedAt) =>
        update((current) => ({
          ...current,
          escalations: current.escalations.map((escalation) =>
            escalation.conversationId === conversationId && escalation.resolvedAt === null
              ? { ...escalation, resolvedAt }
              : escalation
          )
        }))
    })
  })
