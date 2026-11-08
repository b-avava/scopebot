import { Store } from "@scope-bot/db"
import {
  type ApprovalDecision,
  ApprovalId,
  ApprovalNotPending,
  type ApprovalRequest,
  type NewApproval,
  ReferenceNotFound
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { eventOf } from "./Activities.ts"
import { nowIso } from "./Agents.ts"

/** Risky actions waiting for a person. Deciding records the answer: nothing runs on its own yet. */
export class Approvals extends Context.Service<
  Approvals,
  {
    readonly list: Effect.Effect<ReadonlyArray<ApprovalRequest>>
    create(input: NewApproval): Effect.Effect<ApprovalRequest, ReferenceNotFound>
    decide(id: ApprovalId, decision: ApprovalDecision): Effect.Effect<ApprovalRequest, ApprovalNotPending>
  }
>()("@scope-bot/agents/Approvals") {
  static readonly layer = Layer.effect(
    Approvals,
    Effect.gen(function* () {
      const store = yield* Store

      return Approvals.of({
        list: store.approvals,
        create: Effect.fn("Approvals.create")(function* (input) {
          const links = [
            Option.isSome(yield* store.findAgent(input.agentId)),
            input.dealId === null || Option.isSome(yield* store.findDeal(input.dealId)),
            input.contactId === null || Option.isSome(yield* store.findContact(input.contactId))
          ]
          if (links.includes(false)) return yield* Effect.fail(new ReferenceNotFound())
          const approval: ApprovalRequest = {
            ...input,
            id: ApprovalId.make(crypto.randomUUID()),
            status: "pending",
            createdAt: yield* nowIso,
            decidedAt: null
          }
          yield* store.saveApproval(approval)
          return approval
        }),
        decide: Effect.fn("Approvals.decide")(function* (id, decision) {
          const found = yield* store.findApproval(id)
          if (Option.isNone(found) || found.value.status !== "pending") {
            return yield* Effect.fail(new ApprovalNotPending())
          }
          const decidedAt = yield* nowIso
          const decided: ApprovalRequest = { ...found.value, status: decision.status, decidedAt }
          yield* store.saveApproval(decided)
          yield* store.saveActivity(
            eventOf(`${decision.status === "approved" ? "Approved" : "Declined"}: ${decided.title}`, decided, decidedAt)
          )
          return decided
        })
      })
    })
  )
}
