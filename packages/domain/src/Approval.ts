import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { ContactId } from "./Contact.ts"
import { DealId } from "./Deal.ts"

export const ApprovalId = Schema.String.pipe(Schema.brand("ApprovalId"))
export type ApprovalId = typeof ApprovalId.Type

export const ApprovalStatus = Schema.Literals(["pending", "approved", "declined"])
export type ApprovalStatus = typeof ApprovalStatus.Type

export const NewApproval = Schema.Struct({
  agentId: AgentId,
  dealId: Schema.NullOr(DealId),
  contactId: Schema.NullOr(ContactId),
  /** What the employee wants to do. */
  title: Schema.NonEmptyString,
  /** Why, in a sentence a person can judge. */
  reason: Schema.String
})
export type NewApproval = typeof NewApproval.Type

/** A risky action waiting for a person. */
export const ApprovalRequest = Schema.Struct({
  id: ApprovalId,
  ...NewApproval.fields,
  status: ApprovalStatus,
  createdAt: Schema.String,
  decidedAt: Schema.NullOr(Schema.String)
})
export type ApprovalRequest = typeof ApprovalRequest.Type

export const ApprovalDecision = Schema.Struct({
  status: Schema.Literals(["approved", "declined"])
})
export type ApprovalDecision = typeof ApprovalDecision.Type

/** It does not exist, or someone has already decided. */
export class ApprovalNotPending extends Schema.TaggedError<ApprovalNotPending>()(
  "ApprovalNotPending",
  {},
  { httpApiStatus: 409 }
) {}
