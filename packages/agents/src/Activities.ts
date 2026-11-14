import { Store } from "@scope-bot/db"
import {
  type Activity,
  ActivityId,
  ActivityNotFound,
  type ActivityPatch,
  type AgentId,
  type ContactId,
  type DealId,
  type NewActivity,
  ReferenceNotFound
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { nowIso } from "./Agents.ts"

/** Builds an event, the record of something that already happened. */
export const eventOf = (
  text: string,
  links: { readonly contactId: ContactId | null; readonly dealId: DealId | null; readonly agentId?: AgentId | null },
  createdAt: string
): Activity => ({
  id: ActivityId.make(crypto.randomUUID()),
  kind: "event",
  text,
  contactId: links.contactId,
  dealId: links.dealId,
  agentId: links.agentId ?? null,
  done: false,
  dueAt: null,
  createdAt
})

/** Notes, tasks and the record of what happened with contacts and deals. */
export class Activities extends Context.Service<
  Activities,
  {
    readonly list: Effect.Effect<ReadonlyArray<Activity>>
    create(input: NewActivity): Effect.Effect<Activity, ReferenceNotFound>
    update(id: ActivityId, patch: ActivityPatch): Effect.Effect<Activity, ActivityNotFound>
    remove(id: ActivityId): Effect.Effect<void, ActivityNotFound>
  }
>()("@scope-bot/agents/Activities") {
  static readonly layer = Layer.effect(
    Activities,
    Effect.gen(function* () {
      const store = yield* Store

      const get = (id: ActivityId) =>
        store.findActivity(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ActivityNotFound()),
              onSome: Effect.succeed
            })
          )
        )

      return Activities.of({
        list: store.activities,
        create: Effect.fn("Activities.create")(function* (input) {
          const links = [
            input.contactId === null || Option.isSome(yield* store.findContact(input.contactId)),
            input.dealId === null || Option.isSome(yield* store.findDeal(input.dealId)),
            input.agentId === null || Option.isSome(yield* store.findAgent(input.agentId))
          ]
          if (links.includes(false)) return yield* Effect.fail(new ReferenceNotFound())
          const activity: Activity = {
            ...input,
            id: ActivityId.make(crypto.randomUUID()),
            done: false,
            createdAt: yield* nowIso
          }
          yield* store.saveActivity(activity)
          return activity
        }),
        update: Effect.fn("Activities.update")(function* (id, patch) {
          const updated: Activity = { ...(yield* get(id)), ...patch }
          yield* store.saveActivity(updated)
          return updated
        }),
        remove: Effect.fn("Activities.remove")(function* (id) {
          yield* get(id)
          yield* store.removeActivity(id)
        })
      })
    })
  )
}
