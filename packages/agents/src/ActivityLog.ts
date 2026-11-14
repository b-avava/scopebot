import { Store } from "@scope-bot/db"
import { ActionNotFound, type ActivityPage, type ActivityQuery, type AgentAction } from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"

/**
 * What every AI employee did, for the people who supervise them (ADR 0022).
 * The records never change: this only reads them, with the counts from the database.
 */
export class ActivityLog extends Context.Service<
  ActivityLog,
  {
    page(query: ActivityQuery): Effect.Effect<ActivityPage>
    /** Everything done in reply to the same message as this action, oldest first. */
    steps(id: string): Effect.Effect<ReadonlyArray<AgentAction>, ActionNotFound>
  }
>()("@scope-bot/agents/ActivityLog") {
  static readonly layer = Layer.effect(
    ActivityLog,
    Effect.gen(function* () {
      const store = yield* Store

      return ActivityLog.of({
        page: (query) => store.activityLog(query),
        steps: (id) =>
          store.actionTurn(id).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new ActionNotFound()),
                onSome: (steps) => Effect.succeed(steps)
              })
            )
          )
      })
    })
  )
}
