import { Store } from "@scope-bot/db"
import { ReferenceNotFound, type Service, type ServiceDetails, ServiceId, ServiceNotFound } from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { nowIso } from "./Agents.ts"

/** What the business sells. Employees quote from this list and nothing else. */
export class Services extends Context.Service<
  Services,
  {
    readonly list: Effect.Effect<ReadonlyArray<Service>>
    create(details: ServiceDetails): Effect.Effect<Service, ReferenceNotFound>
    update(id: ServiceId, details: ServiceDetails): Effect.Effect<Service, ServiceNotFound | ReferenceNotFound>
    remove(id: ServiceId): Effect.Effect<void, ServiceNotFound>
  }
>()("@scope-bot/agents/Services") {
  static readonly layer = Layer.effect(
    Services,
    Effect.gen(function* () {
      const store = yield* Store

      const get = (id: ServiceId) =>
        store.findService(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ServiceNotFound()),
              onSome: Effect.succeed
            })
          )
        )

      const validate = Effect.fn("Services.validate")(function* (details: ServiceDetails) {
        const agents = yield* store.agents
        if (!details.sellerIds.every((id) => agents.some((agent) => agent.id === id))) {
          return yield* Effect.fail(new ReferenceNotFound())
        }
      })

      return Services.of({
        list: store.services,
        create: Effect.fn("Services.create")(function* (details) {
          yield* validate(details)
          const service: Service = { ...details, id: ServiceId.make(crypto.randomUUID()), createdAt: yield* nowIso }
          yield* store.saveService(service)
          return service
        }),
        update: Effect.fn("Services.update")(function* (id, details) {
          const existing = yield* get(id)
          yield* validate(details)
          const updated: Service = { ...existing, ...details }
          yield* store.saveService(updated)
          return updated
        }),
        remove: Effect.fn("Services.remove")(function* (id) {
          yield* get(id)
          yield* store.removeService(id)
        })
      })
    })
  )
}
