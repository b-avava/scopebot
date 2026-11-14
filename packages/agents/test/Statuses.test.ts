import { assert, describe, it } from "@effect/vitest"
import { Store } from "@scope-bot/db"
import { type Agent, AgentId, ApprovalId, ConversationId, defaultSettings } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { Agents, stateOf } from "../src/Agents.ts"

const agent = (extra: Partial<Agent> = {}): Agent => ({
  ...defaultSettings({ name: "Nino", job: "Sales", color: "#3B8BEB" }),
  id: AgentId.make("nino"),
  role: null,
  pinned: false,
  createdAt: "",
  ...extra
})

const officeHours = {
  ...agent().hours,
  enabled: true,
  from: "09:00",
  to: "18:00",
  days: [1, 2, 3, 4, 5],
  timeZone: "UTC"
}

// A Monday at noon and at night, in UTC.
const noon = new Date("2026-11-09T12:00:00.000Z")
const night = new Date("2026-11-09T22:00:00.000Z")
const nothing = { waiting: false, handedOver: false }

describe("stateOf", () => {
  it("works by default, and sleeps outside working hours", () => {
    assert.strictEqual(stateOf(agent({ hours: officeHours }), noon, nothing), "working")
    assert.strictEqual(stateOf(agent({ hours: officeHours }), night, nothing), "after-hours")
  })

  it("puts what needs a person before the hours", () => {
    const sleeping = agent({ hours: officeHours })

    assert.strictEqual(stateOf(sleeping, night, { waiting: false, handedOver: true }), "with-person")
    assert.strictEqual(stateOf(sleeping, night, { waiting: true, handedOver: true }), "approval")
  })

  it("shows a paused employee as paused, whatever else is true", () => {
    assert.strictEqual(stateOf(agent({ active: false }), noon, { waiting: true, handedOver: true }), "paused")
  })
})

describe("Agents.statuses", () => {
  it.effect("reads approvals and handoffs from storage", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const agents = yield* Agents
      const nino = agent()
      const lasha = agent({ id: AgentId.make("lasha"), name: "Lasha" })
      const tako = agent({ id: AgentId.make("tako"), name: "Tako" })
      yield* Effect.forEach([nino, lasha, tako], store.saveAgent)
      yield* store.saveApproval({
        id: ApprovalId.make("a"),
        agentId: lasha.id,
        dealId: null,
        contactId: null,
        title: "Offer 10% off",
        reason: "",
        status: "pending",
        createdAt: "",
        decidedAt: null
      })
      yield* store.appendEscalation({
        id: "e",
        agentId: tako.id,
        conversationId: ConversationId.make("tako"),
        reason: "Upset",
        createdAt: "",
        resolvedAt: null
      })

      const statuses = yield* agents.statuses

      assert.deepStrictEqual(
        statuses.map((status) => [status.agentId, status.state]),
        [
          ["nino", "working"],
          ["lasha", "approval"],
          ["tako", "with-person"]
        ]
      )
    }).pipe(Effect.provide(Agents.layer.pipe(Layer.provideMerge(Store.layerMemory))))
  )
})
