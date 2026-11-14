import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { UserId } from "./Auth.ts"
import { Day } from "./Business.ts"
import { AppointmentId, SpecialistId } from "./Calendar.ts"
import { Channel } from "./Channel.ts"
import { ContactId } from "./Contact.ts"

export const MessageId = Schema.String.pipe(Schema.brand("MessageId"))
export type MessageId = typeof MessageId.Type

export const ConversationId = Schema.String.pipe(Schema.brand("ConversationId"))
export type ConversationId = typeof ConversationId.Type

/** The title of a chat until its first message names it. */
export const NEW_CHAT_TITLE = "New chat"

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
  /**
   * On a tab: the person whose chat it is. Only they see it, and the employee's
   * memory is shared only among their tabs. Empty on tabs from before, which
   * owners and admins share.
   */
  ownerId: Schema.optionalKey(UserId),
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

/** On a suggestion in a chat with the team: what the person decided. Empty while it waits. */
const decided = Schema.optionalKey(Schema.Literals(["done", "left"]))

/**
 * What a reply does to an appointment. On a draft it happens only when a person
 * sends it: a booked time is held until then, a move or a cancel waits. In a
 * chat with the team it is a suggestion, done only when the person says so.
 */
export const AppointmentStep = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("book"), appointmentId: AppointmentId, decided }),
  Schema.Struct({
    kind: Schema.Literal("move"),
    appointmentId: AppointmentId,
    specialistId: SpecialistId,
    startsAt: Schema.String,
    decided
  }),
  Schema.Struct({ kind: Schema.Literal("cancel"), appointmentId: AppointmentId, reason: Schema.String, decided })
])
export type AppointmentStep = typeof AppointmentStep.Type

/**
 * A card under an answer in a chat with the team (ADR 0024). It names the
 * records a tool looked up, and the app draws them from the calendar as they
 * are now, never from the model's text.
 */
export const ChatCard = Schema.Union([
  /** One specialist's appointments on one day. */
  Schema.Struct({
    kind: Schema.Literal("day"),
    day: Day,
    specialistId: SpecialistId,
    /** The appointments the answer saw, so the card can show what changed since. */
    appointmentIds: Schema.optionalKey(Schema.Array(AppointmentId))
  })
])
export type ChatCard = typeof ChatCard.Type

/** More would bury the answer. A longer look-up is better asked about in the calendar. */
export const MAX_CARDS = 3

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
  externalId: Schema.optionalKey(Schema.String),
  /**
   * On a draft: why the employee wants a person to take the chat over. It
   * happens only when the draft is sent, since only then does the customer
   * hear that a colleague will answer.
   */
  handoff: Schema.optionalKey(Schema.String),
  /** On a reply: what it does to an appointment. */
  appointment: Schema.optionalKey(AppointmentStep),
  /**
   * A new version of that message: an answer given again, or a question
   * edited. It names the first version, and the latest one is shown (ADR 0023).
   */
  replaces: Schema.optionalKey(MessageId),
  /** On a reply in a chat with the team: what the app shows under it. */
  cards: Schema.optionalKey(Schema.Array(ChatCard))
})
export type ChatMessage = typeof ChatMessage.Type

/** What the team list shows under an employee's name. */
export const LastMessage = Schema.Struct({
  agentId: AgentId,
  text: Schema.String,
  createdAt: Schema.String
})
export type LastMessage = typeof LastMessage.Type

/** The person who agreed to what an employee did, or turned it down. */
export const ActionDecision = Schema.Struct({
  userId: UserId,
  name: Schema.String,
  agreed: Schema.Boolean
})
export type ActionDecision = typeof ActionDecision.Type

/** The longest reason kept on an action. */
export const MAX_REASON_LENGTH = 300

/**
 * Immutable audit record of something an agent did. Records from before the
 * activity log (ADR 0022) have none of the optional fields.
 */
/** What the log says when no model could answer a message. The next try starts afresh. */
export const COULD_NOT_REPLY = "Could not reply"

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
  createdAt: Schema.String,
  /** The chat it happened in. It stays when the chat goes, like the record itself. */
  conversationId: Schema.optionalKey(ConversationId),
  /** Why, in the employee's own words. Only what a model did has one. */
  reason: Schema.optionalKey(Schema.String),
  /** Set when a person's click made it happen, or stopped it. */
  decidedBy: Schema.optionalKey(ActionDecision),
  /** The reply it wrote, so the log can tell whether a draft still waits. */
  replyId: Schema.optionalKey(MessageId),
  /** The appointment it booked or changed, so the log can tell whether it still waits for an OK. */
  appointmentId: Schema.optionalKey(AppointmentId)
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

/** What a person decides about an employee's suggestion in a chat with the team. */
export const DecideSuggestion = Schema.Struct({ decision: Schema.Literals(["do", "leave"]) })
export type DecideSuggestion = typeof DecideSuggestion.Type

/** The message has no suggestion that still waits, or the person may not see it. */
export class SuggestionNotFound extends Schema.TaggedError<SuggestionNotFound>()(
  "SuggestionNotFound",
  {},
  { httpApiStatus: 404 }
) {}

export const SentMessage = Schema.Struct({
  customerMessage: ChatMessage,
  /** Empty when the agent stayed silent, for example after a handoff. */
  reply: Schema.NullOr(ChatMessage),
  /** Stopped: a person stopped the answer before it was done, and nothing was saved (ADR 0025). */
  outcome: Schema.Literals(["replied", "outside-hours", "escalated", "waiting-for-human", "stopped"])
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
