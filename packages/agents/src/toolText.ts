import { type AppointmentStep, atZoned, type ChatCard, dayOf, MAX_REASON_LENGTH, wallClock } from "@scope-bot/domain"

/** What the calendar tools share: reading what the model wrote, and writing what it gets back. */

/**
 * Why the employee answered or acted as it did, for the activity log, like
 * [[WHY: the client asked for Saturday]]. Nobody outside the team sees it.
 */
const WHY_TAG = /\[\[WHY:\s*([^\]]*)\]\]/g

/** What the employee is told, so every reply and tool call says why. */
export const WHY_RULE =
  "End every message, tool calls included, with [[WHY: a few words for your colleagues on why you answered or acted so]]. " +
  "Only your colleagues see it."

/** The reason the model gave, or undefined when it gave none. */
export const reasonOf = (text: string) => {
  const found = [...text.matchAll(WHY_TAG)].map((match) => (match[1] ?? "").trim()).filter((reason) => reason !== "")
  const reason = found.join(" ").replace(/\s+/g, " ")
  if (reason === "") return undefined
  return reason.length > MAX_REASON_LENGTH ? `${reason.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…` : reason
}

export const withoutReason = (text: string) => text.replace(WHY_TAG, "")

export const MAX_DAYS = 7

/** Statuses of an appointment that can still change. */
export const OPEN = ["pending", "booked", "confirmed"]

export type ToolResult = Readonly<Record<string, unknown>>

/** What one tool call did: the result for the model, the line for the audit log, and any change to keep. */
export interface Outcome {
  readonly result: ToolResult
  readonly summary: string
  readonly step?: AppointmentStep
  /** Records to show under the answer, drawn by the app from the calendar (ADR 0024). */
  readonly cards?: ReadonlyArray<ChatCard>
}

const pad = (value: number) => String(value).padStart(2, "0")

/** Like 2026-11-10 14:00, in the calendar's zone. */
export const localTime = (iso: string, timeZone: string) => {
  const clock = wallClock(new Date(iso), timeZone)
  return `${dayOf(new Date(iso), timeZone)} ${pad(clock.hour)}:${pad(clock.minute)}`
}

/** A time like 2026-11-10 14:00 in the calendar's zone, or null when it is not one. */
export const parseLocal = (text: string, timeZone: string) => {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(text)
  if (match === null) return null
  const [, day = "", hours = "0", minutes = "0"] = match
  return atZoned(day, Number(hours) * 60 + Number(minutes), timeZone)
}

export const isDay = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text)
export const dayCount = (value: unknown) => Math.min(Math.max(Math.trunc(Number(value) || 1), 1), MAX_DAYS)

export const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : "")
export const isAnyone = (name: string) =>
  ["", "any", "anyone", "anybody", "all", "everyone"].includes(name.toLowerCase())

/** The exact name first, then a name that contains what the model wrote. */
export const byName = <A extends { readonly name: string }>(items: ReadonlyArray<A>, name: string) => {
  const wanted = name.toLowerCase()
  if (wanted === "") return undefined
  return (
    items.find((item) => item.name.toLowerCase() === wanted) ??
    items.find((item) => item.name.toLowerCase().includes(wanted))
  )
}

export const failed = (tool: string, error: string): Outcome => ({
  result: { tool, ok: false, error },
  summary: `Could not ${tool.replace("_", " ")}: ${error}`
})

export const errorText = (error: { readonly _tag: string; readonly reason?: string }) => {
  if (error._tag === "TimeTaken") return "That time was just taken. Offer other free times."
  if (error._tag === "TimeUnavailable") return error.reason ?? "That time cannot be booked"
  if (error._tag === "CalendarOff") return "The calendar is off"
  if (error._tag === "AppointmentClosed") return "That appointment can no longer change"
  return "Something went wrong, a colleague will help"
}
