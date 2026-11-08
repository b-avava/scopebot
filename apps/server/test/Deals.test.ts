import { assert, layer } from "@effect/vitest"
import { Contacts, Deals, Departments } from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Store } from "@scope-bot/db"
import { DealId, emptyDealDetails, StageId } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { DealsApiHandlers, DepartmentsApiHandlers, PipelinesApiHandlers } from "../src/Http.ts"
import { TestAuthorization } from "./support.ts"

const services = Layer.mergeAll(Deals.layer, Contacts.layer, Departments.layer).pipe(Layer.provide(Store.layerMemory))

const handlers = Layer.mergeAll(DealsApiHandlers, PipelinesApiHandlers, DepartmentsApiHandlers).pipe(
  Layer.provide(TestAuthorization),
  Layer.provide(services)
)

const makeClient = HttpApiTest.groups(Api, ["deals", "pipelines", "departments"])

layer(Layer.mergeAll(handlers, TestAuthorization, HttpServer.layerServices))("Deals and departments API", (it) => {
  it.effect("moves a deal through the funnel", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const [pipeline] = yield* client.pipelines.list()
      const [first, second] = pipeline?.stages ?? []
      if (pipeline === undefined || first === undefined || second === undefined) return assert.fail("no funnel")
      const details = {
        ...emptyDealDetails,
        title: "Website",
        pipelineId: pipeline.id,
        stageId: first.id,
        amount: 500
      }

      const created = yield* client.deals.create({ payload: details })
      const moved = yield* client.deals.update({
        params: { id: created.id },
        payload: { ...details, stageId: second.id }
      })
      assert.strictEqual(moved.stageId, second.id)

      const refused = yield* client.deals
        .update({ params: { id: created.id }, payload: { ...details, stageId: StageId.make("missing") } })
        .pipe(Effect.flip)
      assert.strictEqual(refused._tag, "DealStageNotFound")

      yield* client.deals.remove({ params: { id: created.id } })
      assert.deepStrictEqual(yield* client.deals.list(), [])
    })
  )

  it.effect("answers 404 for an unknown deal", () =>
    Effect.gen(function* () {
      const client = yield* makeClient

      const failure = yield* client.deals.remove({ params: { id: DealId.make("missing") } }).pipe(Effect.flip)

      assert.strictEqual(failure._tag, "DealNotFound")
    })
  )

  it.effect("creates, renames and removes a department", () =>
    Effect.gen(function* () {
      const client = yield* makeClient

      const created = yield* client.departments.create({ payload: { name: "Sales" } })
      const renamed = yield* client.departments.update({ params: { id: created.id }, payload: { name: "Growth" } })
      assert.strictEqual(renamed.name, "Growth")

      yield* client.departments.remove({ params: { id: created.id } })
      assert.deepStrictEqual(yield* client.departments.list(), [])
    })
  )
})
