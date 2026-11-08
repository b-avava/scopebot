import { Store } from "@scope-bot/db"
import {
  ContactNotFound,
  type Deal,
  type DealDetails,
  DealId,
  DealNotFound,
  DealStageNotFound,
  type Pipeline,
  type PipelineDetails,
  PipelineId,
  PipelineInvalid,
  ReferenceNotFound,
  type Stage,
  StageId,
  StageInUse
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { eventOf } from "./Activities.ts"
import { nowIso } from "./Agents.ts"

const defaultStages: ReadonlyArray<Omit<Stage, "id">> = [
  { name: "New", kind: "open", probability: 10 },
  { name: "In progress", kind: "open", probability: 30 },
  { name: "Proposal", kind: "open", probability: 50 },
  { name: "Negotiation", kind: "open", probability: 70 },
  { name: "Won", kind: "won", probability: 100 },
  { name: "Lost", kind: "lost", probability: 0 }
]

/** The first funnel of a business, so deals work before anyone sets one up. */
const defaultPipeline = (createdAt: string): Pipeline => ({
  id: PipelineId.make(crypto.randomUUID()),
  name: "Sales",
  stages: defaultStages.map((stage) => ({ ...stage, id: StageId.make(crypto.randomUUID()) })),
  createdAt
})

const hasEveryKind = (stages: ReadonlyArray<Stage>) =>
  (["open", "won", "lost"] as const).every((kind) => stages.some((stage) => stage.kind === kind))

/** Deals and the funnels they move through. Humans and, later, agents go through this service. */
export class Deals extends Context.Service<
  Deals,
  {
    readonly pipelines: Effect.Effect<ReadonlyArray<Pipeline>>
    updatePipeline(
      id: PipelineId,
      details: PipelineDetails
    ): Effect.Effect<Pipeline, DealStageNotFound | PipelineInvalid | StageInUse>
    readonly list: Effect.Effect<ReadonlyArray<Deal>>
    create(details: DealDetails): Effect.Effect<Deal, DealStageNotFound | ContactNotFound | ReferenceNotFound>
    update(
      id: DealId,
      details: DealDetails
    ): Effect.Effect<Deal, DealNotFound | DealStageNotFound | ContactNotFound | ReferenceNotFound>
    remove(id: DealId): Effect.Effect<void, DealNotFound>
  }
>()("@scope-bot/agents/Deals") {
  static readonly layer = Layer.effect(
    Deals,
    Effect.gen(function* () {
      const store = yield* Store

      /** A business gets its first funnel the first time it is needed. */
      const pipelines = Effect.gen(function* () {
        const existing = yield* store.pipelines
        if (existing.length > 0) return existing
        yield* store.savePipeline(defaultPipeline(yield* nowIso))
        return yield* store.pipelines
      })

      const get = (id: DealId) =>
        store.findDeal(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new DealNotFound()),
              onSome: Effect.succeed
            })
          )
        )

      /** Returns the stage the deal is going to. */
      const validate = Effect.fn("Deals.validate")(function* (details: DealDetails) {
        const pipeline = (yield* pipelines).find((item) => item.id === details.pipelineId)
        const stage = pipeline?.stages.find((item) => item.id === details.stageId)
        if (stage === undefined) return yield* Effect.fail(new DealStageNotFound())
        if (details.contactId !== null && Option.isNone(yield* store.findContact(details.contactId))) {
          return yield* Effect.fail(new ContactNotFound())
        }
        const services = yield* store.services
        const ownerExists = details.ownerId === null || Option.isSome(yield* store.findAgent(details.ownerId))
        if (!ownerExists || !details.serviceIds.every((id) => services.some((item) => item.id === id))) {
          return yield* Effect.fail(new ReferenceNotFound())
        }
        return stage
      })

      return Deals.of({
        pipelines,
        updatePipeline: Effect.fn("Deals.updatePipeline")(function* (id, details) {
          const pipeline = (yield* pipelines).find((item) => item.id === id)
          if (pipeline === undefined) return yield* Effect.fail(new DealStageNotFound())
          if (!hasEveryKind(details.stages)) return yield* Effect.fail(new PipelineInvalid())

          const kept = new Set(details.stages.map((stage) => stage.id))
          const deals = yield* store.deals
          if (deals.some((deal) => deal.pipelineId === id && !kept.has(deal.stageId))) {
            return yield* Effect.fail(new StageInUse())
          }
          const updated: Pipeline = { ...pipeline, ...details }
          yield* store.savePipeline(updated)
          return updated
        }),
        list: store.deals,
        create: Effect.fn("Deals.create")(function* (details) {
          const stage = yield* validate(details)
          const createdAt = yield* nowIso
          const deal: Deal = {
            ...details,
            id: DealId.make(crypto.randomUUID()),
            createdAt,
            stageChangedAt: createdAt,
            closedAt: stage.kind === "open" ? null : createdAt
          }
          yield* store.saveDeal(deal)
          yield* store.saveActivity(eventOf(`Deal created in ${stage.name}`, { ...deal, dealId: deal.id }, createdAt))
          return deal
        }),
        update: Effect.fn("Deals.update")(function* (id, details) {
          const existing = yield* get(id)
          const stage = yield* validate(details)
          const moved = existing.stageId !== details.stageId
          const now = yield* nowIso
          const updated: Deal = {
            ...existing,
            ...details,
            stageChangedAt: moved ? now : existing.stageChangedAt,
            closedAt: moved ? (stage.kind === "open" ? null : now) : existing.closedAt
          }
          yield* store.saveDeal(updated)
          if (moved) yield* store.saveActivity(eventOf(`Moved to ${stage.name}`, { ...updated, dealId: id }, now))
          return updated
        }),
        remove: Effect.fn("Deals.remove")(function* (id) {
          yield* get(id)
          yield* store.removeDeal(id)
        })
      })
    })
  )
}
