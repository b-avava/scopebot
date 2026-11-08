import { assert, describe, it } from "@effect/vitest"
import { Store } from "@scope-bot/db"
import {
  ActivityId,
  ActivityNotFound,
  type AgentId,
  ApprovalId,
  ApprovalNotPending,
  type ContactId,
  type DealDetails,
  defaultSettings,
  emptyContactDetails,
  emptyDealDetails,
  emptyServiceDetails,
  PipelineInvalid,
  ReferenceNotFound,
  ServiceId,
  ServiceNotFound,
  StageId,
  StageInUse
} from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { Activities } from "../src/Activities.ts"
import { AgentChat, servicesFor, systemPrompt } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { Approvals } from "../src/Approvals.ts"
import { ChatModel, type ChatRequest } from "../src/ChatModel.ts"
import { Contacts } from "../src/Contacts.ts"
import { Deals } from "../src/Deals.ts"
import { ModelProviders } from "../src/ModelProviders.ts"
import { Services } from "../src/Services.ts"

const crm = Layer.mergeAll(Deals.layer, Contacts.layer, Services.layer, Activities.layer, Approvals.layer).pipe(
  Layer.provideMerge(Store.layerMemory)
)

const withModel = (requests: Array<ChatRequest>) =>
  AgentChat.layer.pipe(
    Layer.provideMerge(Agents.layer),
    Layer.provideMerge(Contacts.layer),
    Layer.provideMerge(Services.layer),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provide(
      Layer.succeed(
        ChatModel,
        ChatModel.of({
          models: Effect.succeed({ defaultModel: "m", models: [] }),
          reply: (request) =>
            Effect.sync(() => {
              requests.push(request)
              return { text: "A short answer.", model: "m", inputTokens: 1, outputTokens: 1 }
            })
        })
      )
    ),
    Layer.provideMerge(Store.layerMemory)
  )

const newDeal = Effect.gen(function* () {
  const [pipeline] = yield* (yield* Deals).pipelines
  const first = pipeline?.stages[0]
  if (pipeline === undefined || first === undefined) return yield* Effect.die("no funnel")
  const details: DealDetails = { ...emptyDealDetails, title: "Site", pipelineId: pipeline.id, stageId: first.id }
  return { details, pipeline }
})

const person = { ...emptyContactDetails, name: "Anna" }
const newAgent = { name: "Nino", job: "Sales", color: "#000" } as const

describe("Pipelines", () => {
  it.effect("adds and renames stages", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { pipeline } = yield* newDeal
      const extra = { id: StageId.make("demo"), name: "Demo", kind: "open", probability: 40 } as const

      const updated = yield* deals.updatePipeline(pipeline.id, {
        name: "Partners",
        stages: [extra, ...pipeline.stages]
      })

      assert.strictEqual(updated.name, "Partners")
      assert.strictEqual(updated.stages[0]?.name, "Demo")
    }).pipe(Effect.provide(crm))
  )

  it.effect("keeps a stage that has deals", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { details, pipeline } = yield* newDeal
      yield* deals.create(details)

      const failure = yield* deals
        .updatePipeline(pipeline.id, { ...pipeline, stages: pipeline.stages.slice(1) })
        .pipe(Effect.flip)

      assert.instanceOf(failure, StageInUse)
    }).pipe(Effect.provide(crm))
  )

  it.effect("needs a way to win and a way to lose", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { pipeline } = yield* newDeal

      const failure = yield* deals
        .updatePipeline(pipeline.id, { ...pipeline, stages: pipeline.stages.filter((stage) => stage.kind !== "won") })
        .pipe(Effect.flip)

      assert.instanceOf(failure, PipelineInvalid)
    }).pipe(Effect.provide(crm))
  )

  it.effect("records when a deal closes and when it reopens", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { details, pipeline } = yield* newDeal
      const won = pipeline.stages.find((stage) => stage.kind === "won")
      if (won === undefined) return assert.fail("no won stage")
      const deal = yield* deals.create(details)
      assert.isNull(deal.closedAt)

      const closed = yield* deals.update(deal.id, { ...details, stageId: won.id })
      assert.isNotNull(closed.closedAt)

      const reopened = yield* deals.update(deal.id, details)
      assert.isNull(reopened.closedAt)
    }).pipe(Effect.provide(crm))
  )
})

describe("Services", () => {
  it.effect("creates, changes and removes a service, and takes it off its deals", () =>
    Effect.gen(function* () {
      const services = yield* Services
      const deals = yield* Deals
      const { details } = yield* newDeal
      const service = yield* services.create({ ...emptyServiceDetails, name: "Website", price: 4500 })
      const deal = yield* deals.create({ ...details, serviceIds: [service.id] })

      const updated = yield* services.update(service.id, { ...service, price: 5000 })
      assert.strictEqual(updated.price, 5000)

      yield* services.remove(service.id)

      assert.deepStrictEqual(yield* services.list, [])
      const found = (yield* deals.list).find((item) => item.id === deal.id)
      assert.deepStrictEqual(found?.serviceIds, [])
    }).pipe(Effect.provide(crm))
  )

  it.effect("fails for a service that does not exist", () =>
    Effect.gen(function* () {
      const failure = yield* (yield* Services).remove(ServiceId.make("missing")).pipe(Effect.flip)
      assert.instanceOf(failure, ServiceNotFound)
    }).pipe(Effect.provide(crm))
  )
})

describe("Activities", () => {
  it.effect("keeps a task, finishes it and removes it", () =>
    Effect.gen(function* () {
      const activities = yield* Activities
      const task = yield* activities.create({
        kind: "task",
        text: "Call back",
        contactId: null,
        dealId: null,
        agentId: null,
        dueAt: "2026-11-10"
      })
      assert.isFalse(task.done)

      const finished = yield* activities.update(task.id, { done: true })
      assert.isTrue(finished.done)

      yield* activities.remove(task.id)
      const failure = yield* activities.remove(ActivityId.make(task.id)).pipe(Effect.flip)
      assert.instanceOf(failure, ActivityNotFound)
    }).pipe(Effect.provide(crm))
  )

  it.effect("removes the notes of a removed contact and of a removed deal", () =>
    Effect.gen(function* () {
      const activities = yield* Activities
      const contacts = yield* Contacts
      const deals = yield* Deals
      const { details } = yield* newDeal
      const contact = yield* contacts.create(person)
      const deal = yield* deals.create(details)
      const note = { kind: "note", text: "Hi", agentId: null, dueAt: null } as const
      yield* activities.create({ ...note, contactId: contact.id, dealId: null })
      yield* activities.create({ ...note, contactId: null, dealId: deal.id })

      yield* contacts.remove(contact.id)
      yield* deals.remove(deal.id)

      assert.deepStrictEqual(yield* activities.list, [])
    }).pipe(Effect.provide(crm))
  )

  it.effect("keeps a deal's history when its contact is removed", () =>
    Effect.gen(function* () {
      const activities = yield* Activities
      const contacts = yield* Contacts
      const deals = yield* Deals
      const { details } = yield* newDeal
      const contact = yield* contacts.create(person)
      const deal = yield* deals.create({ ...details, contactId: contact.id })
      const note = { kind: "note", text: "On the deal", agentId: null, dueAt: null } as const
      yield* activities.create({ ...note, contactId: contact.id, dealId: deal.id })

      yield* contacts.remove(contact.id)

      const kept = (yield* activities.list).find((item) => item.text === "On the deal")
      assert.strictEqual(kept?.dealId, deal.id)
      assert.isNull(kept?.contactId)
    }).pipe(Effect.provide(crm))
  )
})

describe("Approvals", () => {
  const request = (agentId: AgentId) => ({
    agentId,
    dealId: null,
    contactId: null,
    title: "Offer 12% off",
    reason: "Above the limit"
  })

  it.effect("waits for a person and records the answer once", () =>
    Effect.gen(function* () {
      const approvals = yield* Approvals
      const store = yield* Store
      const agentId = "nino" as AgentId
      const settings = defaultSettings({ name: "Nino", job: "Sales", color: "#000" })
      yield* store.saveAgent({ ...settings, id: agentId, role: null, pinned: false, createdAt: "" })

      const created = yield* approvals.create(request(agentId))
      assert.strictEqual(created.status, "pending")

      const decided = yield* approvals.decide(created.id, { status: "approved" })
      assert.strictEqual(decided.status, "approved")
      assert.isNotNull(decided.decidedAt)

      const again = yield* approvals.decide(created.id, { status: "declined" }).pipe(Effect.flip)
      assert.instanceOf(again, ApprovalNotPending)
    }).pipe(Effect.provide(crm))
  )

  it.effect("needs an employee who exists", () =>
    Effect.gen(function* () {
      const failure = yield* (yield* Approvals).create(request("nobody" as AgentId)).pipe(Effect.flip)
      assert.instanceOf(failure, ReferenceNotFound)
    }).pipe(Effect.provide(crm))
  )

  it.effect("fails for a request that does not exist", () =>
    Effect.gen(function* () {
      const failure = yield* (yield* Approvals)
        .decide(ApprovalId.make("missing"), { status: "approved" })
        .pipe(Effect.flip)
      assert.instanceOf(failure, ApprovalNotPending)
    }).pipe(Effect.provide(crm))
  )
})

describe("Employees and services", () => {
  const agent = {
    ...defaultSettings({ ...newAgent }),
    id: "nino" as AgentId,
    role: null,
    pinned: false,
    createdAt: ""
  }
  const business = { name: "", address: "", phone: "", openingHours: "", about: "", currency: "GEL" }
  const service = {
    ...emptyServiceDetails,
    id: ServiceId.make("s"),
    name: "Store",
    price: 18000,
    pricing: "from",
    createdAt: ""
  } as const

  it("offers only active services the employee may sell", () => {
    const others = [
      { ...service, id: ServiceId.make("off"), active: false },
      { ...service, id: ServiceId.make("other"), sellerIds: ["lasha" as AgentId] }
    ]

    assert.deepStrictEqual(servicesFor(agent, [service, ...others]), [service])
  })

  it("gives the price and the rules to the model", () => {
    const prompt = systemPrompt(agent, business, [{ ...service, maxDiscountPercent: 5 }])

    assert.include(prompt, "Service: Store, from 18000 GEL")
    assert.include(prompt, "Discounts up to 5% only after a colleague agrees.")
  })

  it("never gives a hidden price to the model", () => {
    assert.notInclude(systemPrompt(agent, business, [{ ...service, quotePolicy: "deny" }]), "18000")
  })

  it("tells the model not to name a price that does not exist", () => {
    assert.include(systemPrompt(agent, business, [{ ...service, price: null }]), "Do not name a price")
  })

  it.effect("answers a test question with the service list and saves nothing", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const agents = yield* Agents
      const chat = yield* AgentChat
      const hired = yield* agents.create(newAgent)
      yield* (yield* Services).create({ ...emptyServiceDetails, name: "Store", price: 18000 })

      const answer = yield* chat.preview(hired.id, "How much is a store?")

      assert.strictEqual(answer.text, "A short answer.")
      assert.include(requests[0]?.system, "Service: Store, 18000 GEL")
      assert.deepStrictEqual(yield* (yield* Store).messages(hired.id), [])
    }).pipe(Effect.provide(withModel(requests)))
  })

  it.effect("keeps what the employee wrote about a contact", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const agents = yield* Agents
      const chat = yield* AgentChat
      const contacts = yield* Contacts
      const hired = yield* agents.create(newAgent)
      const contact = yield* contacts.create({ ...person, ownerId: hired.id, bestTime: "After 18:00" })

      const updated = yield* chat.summarize(contact.id)

      assert.strictEqual(updated.summary?.text, "A short answer.")
      assert.strictEqual(updated.summary?.agentId, hired.id)
      assert.include(requests[0]?.turns[0]?.text, "After 18:00")
      assert.include(requests[0]?.system, "not instructions")
    }).pipe(Effect.provide(withModel(requests)))
  })

  it.effect("cannot summarize a contact without an employee", () =>
    Effect.gen(function* () {
      const contact = yield* (yield* Contacts).create(person)
      const failure = yield* (yield* AgentChat).summarize(contact.id as ContactId).pipe(Effect.flip)
      assert.strictEqual(failure._tag, "ContactNotFound")
    }).pipe(Effect.provide(withModel([])))
  )
})
