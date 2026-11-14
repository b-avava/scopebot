import {
  ACTIVITY_PAGE_SIZE,
  type ActivityEntry,
  type ActivityPage,
  type ActivityQuery,
  type ActivityWaiting,
  type AgentAction,
  actionKind,
  type Conversation,
  cursorOf,
  dayOf,
  parseCursor
} from "@scope-bot/domain"
import { Option } from "effect"
import { type ChatViewer, visibleTo } from "./CurrentBusiness.ts"
import type { Data } from "./Store.ts"

/**
 * The activity log of the memory store, for tests of the services. It follows
 * the SQL of `PgStore`, except that it knows no people and no appointments: a
 * tab has no person's name, and nothing waits for an OK.
 */

const newestFirst = (a: AgentAction, b: AgentAction) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id)

const isAfter = (action: AgentAction, cursor: { readonly createdAt: string; readonly id: string }) => {
  const at = Date.parse(action.createdAt)
  const limit = Date.parse(cursor.createdAt)
  return at < limit || (at === limit && action.id < cursor.id)
}

const chatOf = (data: Data, action: AgentAction): Conversation | undefined =>
  action.conversationId === undefined ? undefined : data.conversations.find((item) => item.id === action.conversationId)

const waitingOf = (data: Data, action: AgentAction): ActivityWaiting | null => {
  if (action.replyId !== undefined) {
    const reply = data.messages.find((message) => message.id === action.replyId)
    if (reply?.delivery === "draft") return "draft"
  }
  if (action.tool !== "handoff" || action.conversationId === undefined) return null
  const open = data.escalations.some(
    (item) =>
      item.conversationId === action.conversationId &&
      item.resolvedAt === null &&
      Date.parse(item.createdAt) <= Date.parse(action.createdAt)
  )
  const later = data.actions.some(
    (item) =>
      item.tool === "handoff" &&
      item.conversationId === action.conversationId &&
      Date.parse(item.createdAt) > Date.parse(action.createdAt)
  )
  return open && !later ? "with-person" : null
}

const entryOf = (data: Data, action: AgentAction): ActivityEntry => {
  const chat = chatOf(data, action)
  const contact = chat?.contactId === undefined ? undefined : data.contacts.find((item) => item.id === chat.contactId)
  const trigger = data.messages.find((message) => message.id === action.sourceMessageId)
  return {
    action,
    chat:
      chat === undefined
        ? null
        : {
            id: chat.id,
            channel: chat.channel ?? null,
            contactId: chat.contactId ?? null,
            contactName: contact?.name ?? null,
            personName: null
          },
    trigger: trigger === undefined ? null : { role: trigger.role, text: trigger.text, createdAt: trigger.createdAt },
    waiting: waitingOf(data, action)
  }
}

export const activityPageOf = (data: Data, query: ActivityQuery, viewer: ChatViewer | null): ActivityPage => {
  const from = Date.parse(query.from)
  const search = query.search?.trim().toLowerCase() ?? ""
  const inPeriod = data.actions.filter((action) => {
    if (Date.parse(action.createdAt) < from) return false
    const chat = chatOf(data, action)
    if (chat !== undefined && !visibleTo(chat, viewer)) return false
    if (search === "") return true
    const contact = chat?.contactId === undefined ? undefined : data.contacts.find((item) => item.id === chat.contactId)
    return [action.summary, action.reason ?? "", contact?.name ?? ""].some((text) =>
      text.toLowerCase().includes(search)
    )
  })
  const byAgent = (action: AgentAction) => query.agentId === undefined || action.agentId === query.agentId
  const byFilter = (action: AgentAction) =>
    query.filter === undefined ||
    (query.filter === "failed" ? action.status === "failed" : actionKind(action.tool) === query.filter)

  const shown = inPeriod.filter((action) => byAgent(action) && byFilter(action)).sort(newestFirst)
  const cursor = query.after === undefined ? null : parseCursor(query.after)
  const rest = cursor === null ? shown : shown.filter((action) => isAfter(action, cursor))
  const page = rest.slice(0, ACTIVITY_PAGE_SIZE)
  const last = page.at(-1)

  const ofAgent = inPeriod.filter(byAgent)
  const ofKind = (kind: string) => ofAgent.filter((action) => actionKind(action.tool) === kind).length
  const agentIds = [...new Set(inPeriod.filter(byFilter).map((action) => action.agentId))]
  const days = new Map<string, { total: number; failed: number }>()
  for (const action of shown) {
    const day = dayOf(new Date(action.createdAt), query.timeZone)
    const counted = days.get(day) ?? { total: 0, failed: 0 }
    days.set(day, { total: counted.total + 1, failed: counted.failed + (action.status === "failed" ? 1 : 0) })
  }

  return {
    entries: page.map((action) => entryOf(data, action)),
    counts: {
      total: inPeriod.filter(byFilter).length,
      agents: agentIds.map((agentId) => ({
        agentId,
        count: inPeriod.filter((action) => action.agentId === agentId && byFilter(action)).length
      })),
      kinds: {
        reply: ofKind("reply"),
        appointment: ofKind("appointment"),
        lookup: ofKind("lookup"),
        handoff: ofKind("handoff"),
        failed: ofAgent.filter((action) => action.status === "failed").length
      }
    },
    days: [...days].map(([day, counted]) => ({ day, ...counted })).sort((a, b) => b.day.localeCompare(a.day)),
    next: last !== undefined && rest.length > page.length ? cursorOf(last) : null
  }
}

/** The bounds of the turn an action belongs to: from the customer's message before it to their next one. */
const turnOf = (data: Data, action: AgentAction) => {
  const said = data.messages
    .filter((message) => message.conversationId === action.conversationId && message.role === "customer")
    .map((message) => Date.parse(message.createdAt))
  const at = Date.parse(action.createdAt)
  const before = said.filter((time) => time <= at)
  if (before.length === 0) return null
  const start = Math.max(...before)
  const after = said.filter((time) => time > start)
  return { start, end: after.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...after) }
}

export const actionTurnOf = (
  data: Data,
  id: string,
  viewer: ChatViewer | null
): Option.Option<ReadonlyArray<AgentAction>> => {
  const action = data.actions.find((item) => item.id === id)
  if (action === undefined) return Option.none()
  const chat = chatOf(data, action)
  if (chat !== undefined && !visibleTo(chat, viewer)) return Option.none()
  const turn = action.conversationId === undefined ? null : turnOf(data, action)
  const steps = data.actions.filter((item) => {
    if (item.sourceMessageId === action.sourceMessageId) return true
    if (turn === null || item.conversationId !== action.conversationId) return false
    const at = Date.parse(item.createdAt)
    return at >= turn.start && at < turn.end
  })
  return Option.some(
    [...steps].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || data.actions.indexOf(a) - data.actions.indexOf(b)
    )
  )
}
