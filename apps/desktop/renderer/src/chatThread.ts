import { type AgentAction, type ChatMessage, COULD_NOT_REPLY, STOPPED } from "@scope-bot/domain"

/** What the employee did for one answer, and why it answered so (ADR 0023). */
export interface AnswerSteps {
  /** Tools it used, in order. The reply itself is not one of them. */
  readonly steps: ReadonlyArray<AgentAction>
  /** Why it answered as it did, when the model said. */
  readonly reason: string | null
  /** From the first step to the answer. */
  readonly durationMs: number
}

const time = (iso: string) => new Date(iso).getTime()

/**
 * Splits a chat's log into the answers it led to. Actions for one question run
 * in order until one names the answer it wrote; what comes after that belongs
 * to the next version of the answer. A try that failed or was stopped leaves its steps out.
 */
export const stepsByAnswer = (actions: ReadonlyArray<AgentAction>): ReadonlyMap<string, AnswerSteps> => {
  const byAnswer = new Map<string, AnswerSteps>()
  const running = new Map<string, Array<AgentAction>>()
  const ordered = [...actions].sort((left, right) => time(left.createdAt) - time(right.createdAt))
  for (const action of ordered) {
    const steps = running.get(action.sourceMessageId) ?? []
    // A try that ended without an answer is over; trying again starts with no steps.
    if ((action.summary === COULD_NOT_REPLY || action.summary === STOPPED) && action.status === "failed") {
      running.delete(action.sourceMessageId)
      continue
    }
    if (action.replyId === undefined) {
      running.set(action.sourceMessageId, [...steps, action])
      continue
    }
    running.delete(action.sourceMessageId)
    const first = steps[0]?.createdAt ?? action.createdAt
    byAnswer.set(action.replyId, {
      steps,
      reason: action.reason ?? null,
      durationMs: Math.max(0, time(action.createdAt) - time(first))
    })
  }
  return byAnswer
}

/** The question the chat ends on with no answer yet, which may be tried again. */
export const unansweredQuestion = (shown: ReadonlyArray<ChatMessage>) => {
  const last = shown.findLast((message) => message.role !== "note")
  return last?.role === "customer" ? last : null
}

/** The last question and the answer to it, the only ones that can change. */
export const lastExchange = (shown: ReadonlyArray<ChatMessage>) => {
  const question = shown.findLast((message) => message.role === "customer") ?? null
  const answer =
    question === null
      ? null
      : (shown.slice(shown.indexOf(question) + 1).findLast((message) => message.role === "agent") ?? null)
  return { question, answer }
}

const SECOND = 1000

/** "0.9 s", "12 s". */
export const durationLabel = (ms: number) =>
  ms < 10 * SECOND ? `${(ms / SECOND).toFixed(1)} s` : `${Math.round(ms / SECOND)} s`
