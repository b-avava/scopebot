import { assert, describe, it } from "@effect/vitest"
import { Store } from "@scope-bot/db"
import {
  ContactId,
  ContactNotFound,
  type DealDetails,
  DealId,
  DealNotFound,
  DealStageNotFound,
  emptyContactDetails,
  emptyDealDetails,
  StageId
} from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { Contacts } from "../src/Contacts.ts"
import { Deals } from "../src/Deals.ts"

const services = Layer.mergeAll(Deals.layer, Contacts.layer).pipe(Layer.provideMerge(Store.layerMemory))

const newDeal = Effect.gen(function* () {
  const [pipeline] = yield* (yield* Deals).pipelines
  if (pipeline === undefined) return yield* Effect.die("no pipeline")
  const [first, second] = pipeline.stages
  if (first === undefined || second === undefined) return yield* Effect.die("no stages")
  const details: DealDetails = {
    ...emptyDealDetails,
    title: "Website",
    pipelineId: pipeline.id,
    stageId: first.id,
    amount: 1200.5,
    source: "Referral"
  }
  return { details, next: second.id }
})

describe("Deals", () => {
  it.effect("starts with a funnel that can end in a win or a loss", () =>
    Effect.gen(function* () {
      const pipelines = yield* (yield* Deals).pipelines

      assert.strictEqual(pipelines.length, 1)
      const kinds = pipelines[0]?.stages.map((stage) => stage.kind) ?? []
      assert.includeMembers(kinds, ["open", "won", "lost"])
    }).pipe(Effect.provide(services))
  )

  it.effect("keeps the funnel it finds and does not add another one", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const first = yield* Effect.provide(
        Deals.use((deals) => deals.pipelines),
        Deals.layer.pipe(Layer.provide(Layer.succeed(Store, store)))
      )
      const second = yield* Effect.provide(
        Deals.use((deals) => deals.pipelines),
        Deals.layer.pipe(Layer.provide(Layer.succeed(Store, store)))
      )

      assert.deepStrictEqual(second, first)
    }).pipe(Effect.provide(Store.layerMemory))
  )

  it.effect("creates a deal and moves it to another stage", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { details, next } = yield* newDeal

      const created = yield* deals.create(details)
      const moved = yield* deals.update(created.id, { ...details, stageId: next })

      assert.strictEqual(moved.id, created.id)
      assert.strictEqual(moved.createdAt, created.createdAt)
      assert.deepStrictEqual(yield* deals.list, [moved])
      const events = yield* (yield* Store).activities
      assert.isTrue(events.some((event) => event.dealId === created.id && event.text.startsWith("Moved to")))
    }).pipe(Effect.provide(services))
  )

  it.effect("does not accept a stage outside the funnel", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { details } = yield* newDeal

      const failure = yield* deals.create({ ...details, stageId: StageId.make("missing") }).pipe(Effect.flip)

      assert.instanceOf(failure, DealStageNotFound)
      assert.deepStrictEqual(yield* deals.list, [])
    }).pipe(Effect.provide(services))
  )

  it.effect("does not link a contact that does not exist", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { details } = yield* newDeal

      const failure = yield* deals.create({ ...details, contactId: ContactId.make("missing") }).pipe(Effect.flip)

      assert.instanceOf(failure, ContactNotFound)
    }).pipe(Effect.provide(services))
  )

  it.effect("keeps a deal when its contact is removed", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const contacts = yield* Contacts
      const { details } = yield* newDeal
      const contact = yield* contacts.create({ ...emptyContactDetails, name: "Anna" })
      const deal = yield* deals.create({ ...details, contactId: contact.id })

      yield* contacts.remove(contact.id)

      assert.deepStrictEqual(yield* deals.list, [{ ...deal, contactId: null }])
    }).pipe(Effect.provide(services))
  )

  it.effect("removes a deal and fails for one that does not exist", () =>
    Effect.gen(function* () {
      const deals = yield* Deals
      const { details } = yield* newDeal
      const deal = yield* deals.create(details)

      yield* deals.remove(deal.id)

      assert.deepStrictEqual(yield* deals.list, [])
      assert.instanceOf(yield* deals.remove(deal.id).pipe(Effect.flip), DealNotFound)
      assert.instanceOf(yield* deals.update(DealId.make("missing"), details).pipe(Effect.flip), DealNotFound)
    }).pipe(Effect.provide(services))
  )
})
