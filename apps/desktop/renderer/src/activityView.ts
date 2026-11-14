import {
  type ActivityEntry,
  type ActivityFilter,
  type AgentAction,
  addDays,
  COULD_NOT_REPLY,
  dayOf
} from "@scope-bot/domain"

/** How the activity log reads an action. Nothing here counts: the numbers come from the server. */

export type Period = "today" | "week" | "month"

export const periods: ReadonlyArray<{ readonly value: Period; readonly label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" }
]

/** The zone of this computer, which the server counts days in. */
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The start of the period, at midnight here. */
export const periodStart = (period: Period, now: Date) => {
  const back = { today: 0, week: 6, month: 29 }[period]
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).toISOString()
}

const pad = (value: number) => String(value).padStart(2, "0")

export const clock = (iso: string) => {
  const date = new Date(iso)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const clockWithSeconds = (iso: string) => `${clock(iso)}:${pad(new Date(iso).getSeconds())}`

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC"
})

/** Like "Today, Thu 12 Nov" for a day like 2026-11-12. */
export const dayTitle = (day: string, today: string) => {
  const label = dayFormat.format(new Date(`${day}T12:00:00Z`)).replace(",", "")
  if (day === today) return `Today, ${label}`
  if (day === addDays(today, -1)) return `Yesterday, ${label}`
  return label
}

/** Like "Today, 10:34:12" for the panel of one action. */
export const momentOf = (iso: string, zone: string, now: Date) =>
  `${dayTitle(dayOf(new Date(iso), zone), dayOf(now, zone)).split(",")[0]}, ${clockWithSeconds(iso)}`

export const filterLabels: Record<ActivityFilter, string> = {
  reply: "Replied",
  appointment: "Booked, moved, cancelled",
  lookup: "Looked up",
  handoff: "Handed to a person",
  failed: "Didn't work"
}

const toolLabels: Record<string, string> = {
  reply: "Reply",
  handoff: "Hand the chat to a person",
  preview: "Test answer about a service",
  "side-question": "Answer a side question",
  "contact-summary": "Summarize a contact",
  "calendar.free_times": "Look up free times",
  "calendar.schedule": "Look up the schedule",
  "calendar.book": "Book an appointment",
  "calendar.move": "Move an appointment",
  "calendar.cancel": "Cancel an appointment",
  "calendar.confirm": "Confirm an appointment"
}

export const toolLabel = (tool: string) => toolLabels[tool] ?? tool

const channelNames = { whatsapp: "WhatsApp", telegram: "Telegram", instagram: "Instagram" }

/** Summaries that start with what the employee did, so they read after its name. */
const VERBS = [
  "Replied",
  "Wrote",
  "Looked",
  "Booked",
  "Held",
  "Asked",
  "Moved",
  "Cancelled",
  "Will",
  "Confirmed",
  "Could",
  "Answered",
  "Summarized",
  "Sent",
  "Suggested"
]

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`
const upperFirst = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

const HANDOFF_PREFIX = "Handed to a human: "
const PERSON_PREFIX = "A person "

/** Who did it and what, like "Nino" and "replied to Levan Gelashvili". */
export interface Headline {
  readonly who: string
  readonly what: string
  /** Whether the client's name is already in `what`. */
  readonly namesClient: boolean
}

export const headlineOf = (entry: Pick<ActivityEntry, "action" | "chat">, agentName: string): Headline => {
  const { action, chat } = entry
  const client = chat?.contactName ?? null
  if (action.tool === "handoff") {
    return { who: agentName, what: `handed ${client ?? "the chat"} to a person`, namesClient: client !== null }
  }
  if (action.decidedBy !== undefined && action.summary.startsWith(PERSON_PREFIX)) {
    return {
      who: action.decidedBy.name,
      what: action.summary.slice(PERSON_PREFIX.length),
      namesClient: client !== null && action.summary.includes(client)
    }
  }
  const named =
    client === null
      ? action.summary
      : action.summary === COULD_NOT_REPLY
        ? `Could not reply to ${client}`
        : action.summary.replace("the customer", client)
  const namesClient = client !== null && named.includes(client)
  const first = (named.split(" ")[0] ?? "").replace(/:$/, "")
  return VERBS.includes(first)
    ? { who: agentName, what: lowerFirst(named), namesClient }
    : { who: agentName, what: `· ${named}`, namesClient }
}

/** The headline without the name, for the title of the panel. */
export const titleOf = (headline: Headline) => upperFirst(headline.what.replace(/^· /, ""))

export const placeOf = (entry: Pick<ActivityEntry, "chat">) => {
  const { chat } = entry
  if (chat === null) return null
  if (chat.channel === null) return chat.personName === null ? "Team chat" : `Team chat with ${chat.personName}`
  return channelNames[chat.channel]
}

const QUOTE_LENGTH = 80

const quote = (text: string) => {
  const line = text.trim().replace(/\s+/g, " ")
  return `“${line.length > QUOTE_LENGTH ? `${line.slice(0, QUOTE_LENGTH - 1).trimEnd()}…` : line}”`
}

/** The second line of a row: where, who, and what started it. */
export const sublineOf = (entry: ActivityEntry, headline: Headline) => {
  const { action, chat, trigger } = entry
  const parts = [placeOf(entry)]
  if (chat?.contactName != null && !headline.namesClient) parts.push(chat.contactName)
  if (action.tool === "handoff" && action.summary.startsWith(HANDOFF_PREFIX)) {
    parts.push(quote(action.summary.slice(HANDOFF_PREFIX.length)))
  } else if (trigger !== null && trigger.role === "customer" && trigger.text.trim() !== "") {
    parts.push(`after ${quote(trigger.text)}`)
  }
  return parts.filter((part): part is string => part !== null && part !== "").join(" · ")
}

export type StatusTone = "wait" | "fail" | "agreed" | "declined"

const firstName = (name: string) => name.split(" ")[0] ?? name

/** What the right side of a row says, as things are now. */
export const statusOf = (entry: ActivityEntry): { readonly text: string; readonly tone: StatusTone } | null => {
  const { action, waiting } = entry
  if (waiting === "draft") return { text: "Waits for a person", tone: "wait" }
  if (waiting === "pending") return { text: "Waits for your OK", tone: "wait" }
  if (waiting === "with-person") return { text: "A person has the chat", tone: "wait" }
  if (action.status === "failed") return { text: "Didn't work", tone: "fail" }
  if (action.decidedBy !== undefined) {
    const who = firstName(action.decidedBy.name)
    return action.decidedBy.agreed
      ? { text: `${who} agreed`, tone: "agreed" }
      : { text: `${who} turned it down`, tone: "declined" }
  }
  return null
}

/** The author of the message that started an action. */
export const authorOf = (entry: ActivityEntry, agentName: string) => {
  const { trigger, chat } = entry
  if (trigger === null) return ""
  if (trigger.role === "agent") return agentName
  if (trigger.role === "person") return "A colleague"
  if (trigger.role === "note") return "A note"
  if (chat?.channel === null) return chat.personName ?? "A colleague"
  return chat?.contactName ?? "The client"
}

export const tokensText = (action: AgentAction) =>
  action.inputTokens === 0 && action.outputTokens === 0
    ? "None used"
    : `${action.inputTokens.toLocaleString("en-US")} in · ${action.outputTokens.toLocaleString("en-US")} out`

export const countText = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`
