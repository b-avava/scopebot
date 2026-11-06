import { Schema } from "effect"
import { AgentId } from "./Agent.ts"

export const MessageId = Schema.String.pipe(Schema.brand("MessageId"))
export type MessageId = typeof MessageId.Type

export const ChatMessage = Schema.Struct({
  id: MessageId,
  agentId: AgentId,
  /** A note is for the people supervising the chat. Models and customers never see it. */
  role: Schema.Literals(["customer", "agent", "note"]),
  text: Schema.String,
  createdAt: Schema.String
})
export type ChatMessage = typeof ChatMessage.Type

/** Immutable audit record of something an agent did. */
export const AgentAction = Schema.Struct({
  id: Schema.String,
  agentId: AgentId,
  tool: Schema.String,
  status: Schema.Literals(["done", "failed"]),
  summary: Schema.String,
  /** The message that triggered the action. */
  sourceMessageId: MessageId,
  model: Schema.String,
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  createdAt: Schema.String
})
export type AgentAction = typeof AgentAction.Type

/** A chat handed to a human. The agent stays silent until it is resolved. */
export const Escalation = Schema.Struct({
  id: Schema.String,
  agentId: AgentId,
  reason: Schema.String,
  createdAt: Schema.String,
  resolvedAt: Schema.NullOr(Schema.String)
})
export type Escalation = typeof Escalation.Type

export const ChatState = Schema.Struct({
  escalation: Schema.NullOr(Escalation)
})
export type ChatState = typeof ChatState.Type

export const SendMessage = Schema.Struct({
  text: Schema.NonEmptyString
})
export type SendMessage = typeof SendMessage.Type

export const SentMessage = Schema.Struct({
  customerMessage: ChatMessage,
  /** Empty when the agent stayed silent, for example after a handoff. */
  reply: Schema.NullOr(ChatMessage),
  outcome: Schema.Literals(["replied", "outside-hours", "escalated", "waiting-for-human"])
})
export type SentMessage = typeof SentMessage.Type

export class ModelNotConfigured extends Schema.TaggedError<ModelNotConfigured>()(
  "ModelNotConfigured",
  {},
  { httpApiStatus: 503 }
) {}

export class ModelFailed extends Schema.TaggedError<ModelFailed>()(
  "ModelFailed",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}

export class ModelRefused extends Schema.TaggedError<ModelRefused>()("ModelRefused", {}, { httpApiStatus: 422 }) {}
