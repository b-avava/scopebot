import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { Day } from "./Business.ts"
import { ContactId } from "./Contact.ts"
import { ServiceId } from "./Service.ts"

export const PipelineId = Schema.String.pipe(Schema.brand("PipelineId"))
export type PipelineId = typeof PipelineId.Type

export const StageId = Schema.String.pipe(Schema.brand("StageId"))
export type StageId = typeof StageId.Type

export const DealId = Schema.String.pipe(Schema.brand("DealId"))
export type DealId = typeof DealId.Type

/** Whether a deal in this stage is still going, or how it ended. */
export const StageKind = Schema.Literals(["open", "won", "lost"])
export type StageKind = typeof StageKind.Type

const Percent = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 }))

export const Stage = Schema.Struct({
  id: StageId,
  name: Schema.NonEmptyString,
  kind: StageKind,
  /** The usual chance that a deal here closes, used when a deal has none of its own. */
  probability: Percent
})
export type Stage = typeof Stage.Type

/** What can change about a funnel. Stages are in the order deals move through them. */
export const PipelineDetails = Schema.Struct({
  name: Schema.NonEmptyString,
  stages: Schema.Array(Stage)
})
export type PipelineDetails = typeof PipelineDetails.Type

export const Pipeline = Schema.Struct({
  id: PipelineId,
  ...PipelineDetails.fields,
  createdAt: Schema.String
})
export type Pipeline = typeof Pipeline.Type

/** What can change about a deal. */
export const DealDetails = Schema.Struct({
  title: Schema.NonEmptyString,
  /** Empty until the deal is linked to someone. */
  contactId: Schema.NullOr(ContactId),
  pipelineId: PipelineId,
  stageId: StageId,
  amount: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  /** Where the deal came from, in the business's own words. */
  source: Schema.String,
  /** The employee responsible. Empty means a person is. */
  ownerId: Schema.NullOr(AgentId),
  nextStep: Schema.String,
  /** A date, without a time. */
  nextStepAt: Schema.NullOr(Day),
  closeDate: Schema.NullOr(Day),
  /** Empty uses the chance of the stage. */
  probability: Schema.NullOr(Percent),
  lostReason: Schema.String,
  serviceIds: Schema.Array(ServiceId)
})
export type DealDetails = typeof DealDetails.Type

export const Deal = Schema.Struct({
  id: DealId,
  ...DealDetails.fields,
  createdAt: Schema.String,
  /** When the deal entered its current stage. */
  stageChangedAt: Schema.String,
  /** When it was won or lost. */
  closedAt: Schema.NullOr(Schema.String)
})
export type Deal = typeof Deal.Type

export const emptyDealDetails = {
  contactId: null,
  amount: 0,
  source: "",
  ownerId: null,
  nextStep: "",
  nextStepAt: null,
  closeDate: null,
  probability: null,
  lostReason: "",
  serviceIds: []
} as const satisfies Omit<DealDetails, "title" | "pipelineId" | "stageId">

export class DealNotFound extends Schema.TaggedError<DealNotFound>()("DealNotFound", {}, { httpApiStatus: 404 }) {}

/** The pipeline does not exist, or it has no such stage. */
export class DealStageNotFound extends Schema.TaggedError<DealStageNotFound>()(
  "DealStageNotFound",
  {},
  { httpApiStatus: 422 }
) {}

/** A funnel needs a stage for going deals, one for wins and one for losses. */
export class PipelineInvalid extends Schema.TaggedError<PipelineInvalid>()(
  "PipelineInvalid",
  {},
  { httpApiStatus: 422 }
) {}

/** A stage with deals in it cannot be removed. */
export class StageInUse extends Schema.TaggedError<StageInUse>()("StageInUse", {}, { httpApiStatus: 409 }) {}
