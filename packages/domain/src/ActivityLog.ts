import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { isTimeZone } from "./CalendarTime.ts"
import { Channel } from "./Channel.ts"
import { AgentAction, ChatMessage, ConversationId } from "./Chat.ts"
import { ContactId } from "./Contact.ts"

/** What the activity log sorts an action into, by its tool. */
export const ActionKind = Schema.Literals(["reply", "appointment", "lookup", "handoff"])
export type ActionKind = typeof ActionKind.Type

const LOOKUP_TOOLS: ReadonlyArray<string> = ["calendar.free_times", "calendar.schedule"]

/** Storage counts kinds in SQL with the same rules (see `PgStore`). */
export const actionKind = (tool: string): ActionKind => {
  if (tool === "handoff") return "handoff"
  if (LOOKUP_TOOLS.includes(tool)) return "lookup"
  return tool.startsWith("calendar.") ? "appointment" : "reply"
}

/** One choice of the log's filter: a kind, or what did not work. */
export const ActivityFilter = Schema.Literals(["reply", "appointment", "lookup", "handoff", "failed"])
export type ActivityFilter = typeof ActivityFilter.Type

const isInstant = (text: string) => !Number.isNaN(Date.parse(text))

/** How many entries one page of the log has. */
export const ACTIVITY_PAGE_SIZE = 100

/** What the log shows. Every field is text, so it fits a query string. */
export const ActivityQuery = Schema.Struct({
  /** Only actions from this time on, ISO. */
  from: Schema.String.check(Schema.makeFilter(isInstant)),
  /** The zone the days are counted in, like Asia/Tbilisi. */
  timeZone: Schema.String.check(Schema.makeFilter(isTimeZone)),
  agentId: Schema.optionalKey(AgentId),
  filter: Schema.optionalKey(ActivityFilter),
  /** Text in what was done, why, or the client's name. */
  search: Schema.optionalKey(Schema.String),
  /** Where the page before ended, from its `next`. */
  after: Schema.optionalKey(Schema.String)
})
export type ActivityQuery = typeof ActivityQuery.Type

/** The chat an action happened in. */
export const ActivityChat = Schema.Struct({
  id: ConversationId,
  /** Empty for a chat with the team inside the app. */
  channel: Schema.NullOr(Channel),
  contactId: Schema.NullOr(ContactId),
  contactName: Schema.NullOr(Schema.String),
  /** On a chat with the team: the person whose chat it is. */
  personName: Schema.NullOr(Schema.String)
})
export type ActivityChat = typeof ActivityChat.Type

/** The message that started an action, when it was kept. */
export const ActivityTrigger = Schema.Struct({
  role: ChatMessage.fields.role,
  text: Schema.String,
  createdAt: Schema.String
})
export type ActivityTrigger = typeof ActivityTrigger.Type

/**
 * What still waits after an action, as it is now: its draft for a person, its
 * appointment for an OK, or its chat with a person after a handoff.
 */
export const ActivityWaiting = Schema.Literals(["draft", "pending", "with-person"])
export type ActivityWaiting = typeof ActivityWaiting.Type

export const ActivityEntry = Schema.Struct({
  action: AgentAction,
  chat: Schema.NullOr(ActivityChat),
  trigger: Schema.NullOr(ActivityTrigger),
  waiting: Schema.NullOr(ActivityWaiting)
})
export type ActivityEntry = typeof ActivityEntry.Type

/**
 * Counts for the filters, all from the database. Each side of the filter counts
 * with the other side applied: the employees with the chosen kind, the kinds
 * with the chosen employee.
 */
export const ActivityCounts = Schema.Struct({
  /** Every employee, with the chosen kind. */
  total: Schema.Int,
  agents: Schema.Array(Schema.Struct({ agentId: AgentId, count: Schema.Int })),
  kinds: Schema.Struct({
    reply: Schema.Int,
    appointment: Schema.Int,
    lookup: Schema.Int,
    handoff: Schema.Int,
    failed: Schema.Int
  })
})
export type ActivityCounts = typeof ActivityCounts.Type

/** How many actions one day has, with every filter applied. */
export const ActivityDay = Schema.Struct({
  /** Like 2026-11-12, in the zone of the query. */
  day: Schema.String,
  total: Schema.Int,
  failed: Schema.Int
})
export type ActivityDay = typeof ActivityDay.Type

export const ActivityPage = Schema.Struct({
  /** Newest first. */
  entries: Schema.Array(ActivityEntry),
  counts: ActivityCounts,
  /** Newest first. */
  days: Schema.Array(ActivityDay),
  /** Pass as `after` to read on. Empty on the last page. */
  next: Schema.NullOr(Schema.String)
})
export type ActivityPage = typeof ActivityPage.Type

/** It does not exist, or the person may not see the chat it happened in. */
export class ActionNotFound extends Schema.TaggedError<ActionNotFound>()(
  "ActionNotFound",
  {},
  { httpApiStatus: 404 }
) {}

/** The cursor after an entry. Entries are ordered by time, then id. */
export const cursorOf = (action: Pick<AgentAction, "createdAt" | "id">) => `${action.createdAt}|${action.id}`

/** The time and id in a cursor, or null when it is not one. */
export const parseCursor = (cursor: string) => {
  const split = cursor.indexOf("|")
  if (split < 0) return null
  const createdAt = cursor.slice(0, split)
  const id = cursor.slice(split + 1)
  return isInstant(createdAt) && id !== "" ? { createdAt: new Date(createdAt).toISOString(), id } : null
}
