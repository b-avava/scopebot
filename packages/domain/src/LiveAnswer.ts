import { Schema } from "effect"
import { AgentAction, MessageId } from "./Chat.ts"

/**
 * What a chat with the team shows while an employee answers, and how its last
 * answer ended (ADR 0025). The server keeps it in memory only: after a restart
 * every chat is idle and the saved messages tell the rest.
 */
export const LiveStatus = Schema.Literals([
  /** Nothing is happening, or the last answer was saved. */
  "idle",
  "answering",
  /** A person stopped it. What came is kept here, not in the chat. */
  "stopped",
  /** The model broke off after it had started to write. */
  "broke"
])
export type LiveStatus = typeof LiveStatus.Type

export const LiveAnswer = Schema.Struct({
  /** Grows with every change, so the app asks only for what is newer. */
  version: Schema.Int,
  status: LiveStatus,
  /** The question being answered, or the one the last answer was for. */
  questionId: Schema.NullOr(MessageId),
  /** What the employee has written so far, without its tool calls and notes for the log. */
  text: Schema.String,
  /** What it did so far for this answer. */
  steps: Schema.Array(AgentAction),
  startedAt: Schema.NullOr(Schema.String)
})
export type LiveAnswer = typeof LiveAnswer.Type

export const idleAnswer: LiveAnswer = {
  version: 0,
  status: "idle",
  questionId: null,
  text: "",
  steps: [],
  startedAt: null
}

/** The app waits up to this long for something new before it asks again. */
export const LIVE_WAIT_SECONDS = 25

/** The log line of an answer a person stopped. Like a failure, the next try starts afresh. */
export const STOPPED = "Stopped by a person"

/** Tool calls and notes for the log, which a person never sees, as `[[TOOL …]]`, `[[WHY: …]]` or `[[HANDOFF: …]]`. */
const TAG = /\[\[[\s\S]*?\]\]/g

/**
 * What can be shown of a reply still being written: complete tags go, and so
 * does the start of one that has not closed yet.
 */
export const shownSoFar = (text: string) => {
  const closed = text.replace(TAG, "")
  const open = closed.indexOf("[[")
  const cut = open < 0 ? closed : closed.slice(0, open)
  return (cut.endsWith("[") ? cut.slice(0, -1) : cut).replace(/[ \t]+$/g, "")
}
