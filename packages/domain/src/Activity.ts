import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { Day } from "./Business.ts"
import { ContactId } from "./Contact.ts"
import { DealId } from "./Deal.ts"

export const ActivityId = Schema.String.pipe(Schema.brand("ActivityId"))
export type ActivityId = typeof ActivityId.Type

/** A note or a task is written by someone. An event is recorded by the system. */
export const ActivityKind = Schema.Literals(["note", "task", "event"])
export type ActivityKind = typeof ActivityKind.Type

/** Something that happened with a contact or a deal. */
export const Activity = Schema.Struct({
  id: ActivityId,
  kind: ActivityKind,
  text: Schema.NonEmptyString,
  contactId: Schema.NullOr(ContactId),
  dealId: Schema.NullOr(DealId),
  /** The employee who did it or has to do it. Empty means a person. */
  agentId: Schema.NullOr(AgentId),
  /** Only for a task. */
  done: Schema.Boolean,
  dueAt: Schema.NullOr(Day),
  createdAt: Schema.String
})
export type Activity = typeof Activity.Type

export const NewActivity = Schema.Struct({
  kind: Schema.Literals(["note", "task"]),
  text: Schema.NonEmptyString,
  contactId: Schema.NullOr(ContactId),
  dealId: Schema.NullOr(DealId),
  agentId: Schema.NullOr(AgentId),
  dueAt: Schema.NullOr(Day)
})
export type NewActivity = typeof NewActivity.Type

export const ActivityPatch = Schema.Struct({
  done: Schema.Boolean
})
export type ActivityPatch = typeof ActivityPatch.Type

export class ActivityNotFound extends Schema.TaggedError<ActivityNotFound>()(
  "ActivityNotFound",
  {},
  { httpApiStatus: 404 }
) {}
