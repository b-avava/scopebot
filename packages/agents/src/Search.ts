import type { Agent, ChatMessage, Conversation, SearchHit } from "@scope-bot/domain"

const MAX_MESSAGES = 50
const CONTEXT_BEFORE = 40
const CONTEXT_AFTER = 80

export interface SearchData {
  readonly agents: ReadonlyArray<Agent>
  readonly conversations: ReadonlyArray<Conversation>
  readonly messages: ReadonlyArray<ChatMessage>
}

const includes = (text: string, query: string) => text.toLowerCase().includes(query)

/** The part of a message around the match. */
const snippet = (text: string, query: string) => {
  const at = text.toLowerCase().indexOf(query)
  const start = Math.max(0, at - CONTEXT_BEFORE)
  const end = Math.min(text.length, at + query.length + CONTEXT_AFTER)
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`
}

const toAgentHit = (agent: Agent, messages: ReadonlyArray<ChatMessage>): SearchHit => ({
  kind: "agent",
  agentId: agent.id,
  conversationId: null,
  messageId: null,
  title: agent.name,
  detail: messages.findLast((message) => message.agentId === agent.id && message.text !== "")?.text ?? agent.job
})

/**
 * Finds employees, their chats and their messages. An empty query lists the
 * employees, pinned ones first. Notes are for supervisors and stay out of it.
 */
export const searchEverything = ({ agents, conversations, messages }: SearchData, rawQuery: string) => {
  const query = rawQuery.trim().toLowerCase()
  const said = messages.filter((message) => message.role !== "note")
  const pinnedFirst = [...agents].sort((first, second) => Number(second.pinned) - Number(first.pinned))

  if (query === "") return pinnedFirst.map((agent) => toAgentHit(agent, said))

  const nameOf = (agent: Agent["id"]) => agents.find((item) => item.id === agent)?.name ?? ""
  const titleOf = (id: Conversation["id"]) => conversations.find((item) => item.id === id)?.title ?? ""

  const foundAgents = pinnedFirst
    .filter((agent) => [agent.name, agent.job, agent.instructions].some((text) => includes(text, query)))
    .map((agent) => toAgentHit(agent, said))

  const foundChats = conversations
    .filter((conversation) => includes(conversation.title, query))
    .map(
      (conversation): SearchHit => ({
        kind: "chat",
        agentId: conversation.agentId,
        conversationId: conversation.id,
        messageId: null,
        title: conversation.title,
        detail: nameOf(conversation.agentId)
      })
    )

  const foundMessages = said
    .filter((message) => includes(message.text, query))
    .slice(-MAX_MESSAGES)
    .reverse()
    .map(
      (message): SearchHit => ({
        kind: "message",
        agentId: message.agentId,
        conversationId: message.conversationId,
        messageId: message.id,
        title: `${nameOf(message.agentId)} · ${titleOf(message.conversationId)}`,
        detail: snippet(message.text, query)
      })
    )

  return [...foundAgents, ...foundChats, ...foundMessages]
}
