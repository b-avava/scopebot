import { assert, describe, it } from "@effect/vitest"
import {
  type Agent,
  AgentId,
  type ChatMessage,
  type Conversation,
  ConversationId,
  defaultSettings,
  MessageId
} from "@scope-bot/domain"
import { searchEverything } from "../src/Search.ts"

const agent = (id: string, name: string, pinned = false): Agent => ({
  ...defaultSettings({ name, job: "Front desk", color: "#000" }),
  id: AgentId.make(id),
  role: null,
  pinned,
  createdAt: ""
})

const chat = (id: string, agentId: string, title: string): Conversation => ({
  id: ConversationId.make(id),
  agentId: AgentId.make(agentId),
  title,
  createdAt: ""
})

const message = (
  id: string,
  chatId: string,
  agentId: string,
  text: string,
  role: ChatMessage["role"] = "customer"
) => ({
  id: MessageId.make(id),
  agentId: AgentId.make(agentId),
  conversationId: ConversationId.make(chatId),
  role,
  text,
  createdAt: ""
})

const data = {
  agents: [agent("a", "Nino"), agent("b", "Tamar", true)],
  conversations: [chat("c1", "a", "Bookings"), chat("c2", "b", "Прайс-лист")],
  messages: [
    message("m1", "c1", "a", "Please book a cleaning on Friday"),
    message("m2", "c1", "a", "Booked for Friday at 10:00", "agent"),
    message("m3", "c2", "b", "Сколько стоит чистка?"),
    message("m4", "c2", "b", "Nino's backup answered", "note")
  ]
}

describe("searchEverything", () => {
  it("lists employees with their last message when nothing is typed, pinned first", () => {
    const hits = searchEverything(data, "  ")
    assert.deepStrictEqual(
      hits.map((hit) => [hit.kind, hit.title, hit.detail]),
      [
        ["agent", "Tamar", "Сколько стоит чистка?"],
        ["agent", "Nino", "Booked for Friday at 10:00"]
      ]
    )
  })

  it("finds employees, chats and messages in any case and language", () => {
    assert.deepStrictEqual(
      searchEverything(data, "nino").map((hit) => hit.kind),
      ["agent"]
    )
    assert.deepStrictEqual(
      searchEverything(data, "ПРАЙС").map((hit) => [hit.kind, hit.title, hit.detail]),
      [["chat", "Прайс-лист", "Tamar"]]
    )

    const [found] = searchEverything(data, "ЧИСТКА")
    assert.strictEqual(found?.kind, "message")
    assert.strictEqual(found?.title, "Tamar · Прайс-лист")
    assert.strictEqual(found?.conversationId, ConversationId.make("c2"))
    assert.strictEqual(found?.messageId, MessageId.make("m3"))
  })

  it("puts the newest message first and shows the words around a match", () => {
    const long = `${"x".repeat(100)} needle ${"y".repeat(200)}`
    const hits = searchEverything({ ...data, messages: [...data.messages, message("m5", "c1", "a", long)] }, "needle")
    assert.strictEqual(hits[0]?.detail.startsWith("…"), true)
    assert.strictEqual(hits[0]?.detail.endsWith("…"), true)
    assert.include(hits[0]?.detail ?? "", "needle")
    assert.isBelow(hits[0]?.detail.length ?? 999, 140)

    assert.strictEqual(searchEverything(data, "friday")[0]?.messageId, MessageId.make("m2"))
  })
})
