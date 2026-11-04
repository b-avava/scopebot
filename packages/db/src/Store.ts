import {
  Agent,
  AgentAction,
  type AgentId,
  BusinessProfile,
  ChatMessage,
  defaultSettings,
  Escalation,
  emptyBusinessProfile
} from "@scope-bot/domain"
import { Context, Effect, FileSystem, Layer, Option, Path, Schema, Semaphore } from "effect"

const Data = Schema.Struct({
  business: BusinessProfile,
  agents: Schema.Array(Agent),
  messages: Schema.Array(ChatMessage),
  actions: Schema.Array(AgentAction),
  escalations: Schema.Array(Escalation)
})
type Data = typeof Data.Type

const emptyData: Data = { business: emptyBusinessProfile, agents: [], messages: [], actions: [], escalations: [] }

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

/** Brings a file written by an earlier version up to the current format. */
const upgrade = (raw: Record<string, unknown>) => ({
  ...emptyData,
  ...raw,
  agents: (Array.isArray(raw.agents) ? raw.agents : []).map((stored: Record<string, unknown>) => ({
    ...defaultSettings({
      name: String(stored.name),
      job: String(stored.job),
      color: String(stored.color),
      shape: "circle",
      face: "neutral"
    }),
    ...stored,
    shape: validShapes.includes(String(stored.shape)) ? stored.shape : "circle"
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
    /** Also removes the agent's messages, actions and escalations. */
    removeAgent(id: AgentId): Effect.Effect<void>
    messages(agentId: AgentId): Effect.Effect<ReadonlyArray<ChatMessage>>
    appendMessage(message: ChatMessage): Effect.Effect<void>
    actions(agentId: AgentId): Effect.Effect<ReadonlyArray<AgentAction>>
    appendAction(action: AgentAction): Effect.Effect<void>
    openEscalation(agentId: AgentId): Effect.Effect<Option.Option<Escalation>>
    appendEscalation(escalation: Escalation): Effect.Effect<void>
    resolveEscalation(agentId: AgentId, resolvedAt: string): Effect.Effect<void>
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
          business: current.business,
          agents: current.agents.filter((agent) => agent.id !== id),
          messages: current.messages.filter((message) => message.agentId !== id),
          actions: current.actions.filter((action) => action.agentId !== id),
          escalations: current.escalations.filter((escalation) => escalation.agentId !== id)
        })),
      messages: (agentId) => Effect.sync(() => data.messages.filter((message) => message.agentId === agentId)),
      appendMessage: (message) => update((current) => ({ ...current, messages: [...current.messages, message] })),
      actions: (agentId) => Effect.sync(() => data.actions.filter((action) => action.agentId === agentId)),
      appendAction: (action) => update((current) => ({ ...current, actions: [...current.actions, action] })),
      openEscalation: (agentId) =>
        Effect.sync(() =>
          Option.fromNullishOr(
            data.escalations.find((escalation) => escalation.agentId === agentId && escalation.resolvedAt === null)
          )
        ),
      appendEscalation: (escalation) =>
        update((current) => ({ ...current, escalations: [...current.escalations, escalation] })),
      resolveEscalation: (agentId, resolvedAt) =>
        update((current) => ({
          ...current,
          escalations: current.escalations.map((escalation) =>
            escalation.agentId === agentId && escalation.resolvedAt === null
              ? { ...escalation, resolvedAt }
              : escalation
          )
        }))
    })
  })
