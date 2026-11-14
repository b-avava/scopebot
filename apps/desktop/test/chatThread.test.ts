import { assert, describe, it } from "@effect/vitest"
import {
  type AgentAction,
  AgentId,
  type ChatMessage,
  COULD_NOT_REPLY,
  ConversationId,
  MessageId,
  STOPPED
} from "@scope-bot/domain"
import { lastExchange, stepsByAnswer, unansweredQuestion } from "../renderer/src/chatThread.ts"

const at = (second: number) => new Date(Date.UTC(2026, 10, 11, 9, 0, second)).toISOString()

const action = (id: string, second: number, fields: Partial<AgentAction> = {}): AgentAction => ({
  id,
  agentId: AgentId.make("tako"),
  tool: "schedule",
  status: "done",
  summary: id,
  sourceMessageId: MessageId.make("q1"),
  model: "",
  inputTokens: 0,
  outputTokens: 0,
  createdAt: at(second),
  ...fields
})

const message = (id: string, role: ChatMessage["role"]): ChatMessage => ({
  id: MessageId.make(id),
  agentId: AgentId.make("tako"),
  conversationId: ConversationId.make("tab"),
  role,
  text: id,
  createdAt: at(0)
})

describe("stepsByAnswer", () => {
  it("gives each version of an answer the steps since the one before", () => {
    const byAnswer = stepsByAnswer([
      action("look", 1),
      action("reply", 2, { tool: "reply", replyId: MessageId.make("a1"), reason: "asked about tomorrow" }),
      action("look again", 10),
      action("free", 11, { status: "failed" }),
      action("reply again", 13, { tool: "reply", replyId: MessageId.make("a1b") })
    ])
    assert.deepStrictEqual(
      byAnswer.get("a1")?.steps.map((step) => step.id),
      ["look"]
    )
    assert.strictEqual(byAnswer.get("a1")?.reason, "asked about tomorrow")
    assert.deepStrictEqual(
      byAnswer.get("a1b")?.steps.map((step) => step.id),
      ["look again", "free"]
    )
    assert.strictEqual(byAnswer.get("a1b")?.durationMs, 3000)
  })

  it("leaves out the steps of a try that failed or was stopped", () => {
    const byAnswer = stepsByAnswer([
      action("look", 1),
      action("gave up", 2, { tool: "reply", status: "failed", summary: COULD_NOT_REPLY }),
      action("look again", 3),
      action("stopped", 4, { tool: "reply", status: "failed", summary: STOPPED }),
      action("reply", 30, { tool: "reply", replyId: MessageId.make("a1") })
    ])
    assert.deepStrictEqual(byAnswer.get("a1")?.steps, [])
    assert.strictEqual(byAnswer.get("a1")?.durationMs, 0)
  })
})

describe("the end of a thread", () => {
  it("finds the last exchange and a question left without an answer", () => {
    const question = message("q1", "customer")
    const answer = message("a1", "agent")
    const answered = [question, answer, message("n", "note")]
    assert.deepStrictEqual(lastExchange(answered), { question, answer })
    assert.isNull(unansweredQuestion(answered))

    const next = message("q2", "customer")
    const waiting = [...answered, next]
    assert.deepStrictEqual(lastExchange(waiting), { question: next, answer: null })
    assert.strictEqual(unansweredQuestion(waiting)?.id, "q2")
  })
})
