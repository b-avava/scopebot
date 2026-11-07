import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { ConversationId, MessageId } from "./Chat.ts"

/** One thing a search found. The ids say where to open it. */
export const SearchHit = Schema.Struct({
  kind: Schema.Literals(["agent", "chat", "message"]),
  agentId: AgentId,
  conversationId: Schema.NullOr(ConversationId),
  messageId: Schema.NullOr(MessageId),
  title: Schema.String,
  detail: Schema.String
})
export type SearchHit = typeof SearchHit.Type
