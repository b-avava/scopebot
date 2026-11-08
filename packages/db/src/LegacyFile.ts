import {
  defaultSettings,
  emptyBusinessProfile,
  emptyContactDetails,
  emptyDealDetails,
  emptyServiceDetails
} from "@scope-bot/domain"
import { Effect, FileSystem, Schema } from "effect"
import { Data, emptyData } from "./Store.ts"

const decodeData = Schema.decodeUnknownEffect(Data)

type Stored = Record<string, unknown>

const list = (value: unknown): ReadonlyArray<Stored> => (Array.isArray(value) ? value : [])

/** Before tabs, an agent had one chat. It became the chat that shares the agent's id. */
const inFirstChat = (stored: Stored) => ({ conversationId: stored.agentId, ...stored })

const stageChances: Record<string, number> = { open: 30, won: 100, lost: 0 }

/** The stages every older file started with, so its forecast matches a new funnel. */
const startingStageChances: Record<string, number> = { New: 10, Proposal: 50 }

/** Prices used to be free text on the business profile. */
const upgradeServices = (raw: Stored) => {
  if (Array.isArray(raw.services)) return raw.services
  const business = raw.business as Stored | undefined
  return list(business?.services)
    .filter((service) => String(service.name ?? "").trim() !== "")
    .map((service) => {
      const digits = String(service.price ?? "").replace(/[^0-9.]/g, "")
      return {
        ...emptyServiceDetails,
        id: crypto.randomUUID(),
        name: String(service.name),
        description: String(service.price ?? ""),
        price: digits === "" ? null : Number(digits),
        createdAt: new Date().toISOString()
      }
    })
}

/** Jobs used to be a fixed list, each with its own sign. */
const legacySigns: Record<string, string> = {
  "Front desk": "headset",
  Sales: "tag",
  "Follow-ups": "repeat",
  Reports: "chart"
}

/** Brings a file written by an earlier version up to the current format. */
const upgrade = (raw: Stored) => ({
  ...emptyData,
  ...raw,
  business: { ...emptyBusinessProfile, ...(raw.business as Stored | undefined) },
  services: upgradeServices(raw),
  contacts: list(raw.contacts).map((stored) => ({ ...emptyContactDetails, summary: null, ...stored })),
  pipelines: list(raw.pipelines).map((pipeline) => ({
    ...pipeline,
    stages: list(pipeline.stages).map((stage) => ({
      probability: startingStageChances[String(stage.name)] ?? stageChances[String(stage.kind)] ?? 30,
      ...stage
    }))
  })),
  deals: list(raw.deals).map((stored) => ({
    ...emptyDealDetails,
    stageChangedAt: stored.createdAt,
    closedAt: null,
    ...stored
  })),
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
      color: String(stored.color)
    }),
    ...Object.fromEntries(Object.entries(stored).filter(([key]) => key !== "shape" && key !== "face")),
    sign: legacySigns[String(stored.job)] ?? null,
    role: null,
    pinned: stored.pinned === true,
    backupModels: (Array.isArray(stored.backupModels) ? stored.backupModels : []).map((backup: unknown) =>
      typeof backup === "string" ? { provider: "api", model: backup } : backup
    )
  }))
})

/** The JSON file data lived in before PostgreSQL, brought up to the current format. */
export const readLegacyFile = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const json = yield* fs.readFileString(filePath)
    return yield* decodeData(upgrade(JSON.parse(json)))
  })
