import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { ContactId } from "./Contact.ts"

export const MessageId = Schema.String.pipe(Schema.brand("MessageId"))
export type MessageId = typeof MessageId.Type

export const ConversationId = Schema.String.pipe(Schema.brand("ConversationId"))
export type ConversationId = typeof ConversationId.Type

/** The title of a chat until its first message names it. */
export const NEW_CHAT_TITLE = "New chat"

/** Where customers write from, other than the app itself. */
export const Channel = Schema.Literals(["whatsapp", "telegram"])
export type Channel = typeof Channel.Type

/**
 * One tab of an employee, or a chat with a customer on a channel. Tabs separate
 * tasks and share the employee's memory. A channel chat shares nothing, because
 * it belongs to one customer.
 */
export const Conversation = Schema.Struct({
  id: ConversationId,
  agentId: AgentId,
  title: Schema.NonEmptyString,
  createdAt: Schema.String,
  channel: Schema.optionalKey(Channel),
  /** Who to answer on the channel, such as a WhatsApp chat id. */
  address: Schema.optionalKey(Schema.String),
  contactId: Schema.optionalKey(ContactId)
})
export type Conversation = typeof Conversation.Type

export const ConversationSummary = Schema.Struct({
  ...Conversation.fields,
  messageCount: Schema.Int
})
export type ConversationSummary = typeof ConversationSummary.Type

export const RenameConversation = Schema.Struct({
  title: Schema.NonEmptyString
})
export type RenameConversation = typeof RenameConversation.Type

export class ConversationNotFound extends Schema.TaggedError<ConversationNotFound>()(
  "ConversationNotFound",
  {},
  { httpApiStatus: 404 }
) {}

/** An employee always keeps one chat. */
export class ConversationRequired extends Schema.TaggedError<ConversationRequired>()(
  "ConversationRequired",
  {},
  { httpApiStatus: 409 }
) {}

/** Largest number of photos in one message. */
export const MAX_MESSAGE_IMAGES = 4

export const ChatImage = Schema.Struct({
  mediaType: Schema.Literals(["image/jpeg", "image/png", "image/webp"]),
  /** Base64, without a data URL prefix. */
  data: Schema.NonEmptyString
})
export type ChatImage = typeof ChatImage.Type

const MessageImages = Schema.Array(ChatImage).check(Schema.isMaxLength(MAX_MESSAGE_IMAGES))

export const MessageDelivery = Schema.Literals(["draft", "sending", "sent", "failed", "discarded"])
export type MessageDelivery = typeof MessageDelivery.Type

export const ChatMessage = Schema.Struct({
  id: MessageId,
  agentId: AgentId,
  conversationId: ConversationId,
  /**
   * A note is for the people supervising the chat. Models and customers never see it.
   * A person is someone from the team writing to the customer themselves.
   */
  role: Schema.Literals(["customer", "agent", "note", "person"]),
  text: Schema.String,
  images: Schema.optionalKey(MessageImages),
  createdAt: Schema.String,
  /** Only on channel chats: whether a reply reached the customer. A draft waits for a person. */
  delivery: Schema.optionalKey(MessageDelivery),
  /** The id the channel gave the message, so the same one is never stored twice. */
  externalId: Schema.optionalKey(Schema.String)
})
export type ChatMessage = typeof ChatMessage.Type

/** What the team list shows under an employee's name. */
export const LastMessage = Schema.Struct({
  agentId: AgentId,
  text: Schema.String,
  createdAt: Schema.String
})
export type LastMessage = typeof LastMessage.Type

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
  conversationId: ConversationId,
  reason: Schema.String,
  createdAt: Schema.String,
  resolvedAt: Schema.NullOr(Schema.String)
})
export type Escalation = typeof Escalation.Type

export const ChatState = Schema.Struct({
  escalation: Schema.NullOr(Escalation)
})
export type ChatState = typeof ChatState.Type

/** A message can be only a photo, but it cannot be empty. */
export const SendMessage = Schema.Struct({
  text: Schema.String,
  images: Schema.optionalKey(MessageImages)
}).check(Schema.makeFilter((message) => message.text.trim() !== "" || (message.images?.length ?? 0) > 0))
export type SendMessage = typeof SendMessage.Type

/** A question from a supervisor. It stays out of the customer's conversation. */
export const SideQuestion = Schema.Struct({
  text: Schema.NonEmptyString
})
export type SideQuestion = typeof SideQuestion.Type

export const SideAnswer = Schema.Struct({
  text: Schema.String
})
export type SideAnswer = typeof SideAnswer.Type

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
