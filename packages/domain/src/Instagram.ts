import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { ChannelSettings } from "./Channel.ts"
import { ChatMessage, ConversationId } from "./Chat.ts"
import { ContactId } from "./Contact.ts"

/** Instagram lets a business answer for this long after the customer's last message. */
export const INSTAGRAM_REPLY_HOURS = 24
/** After that, only a person may answer, for this long. */
export const INSTAGRAM_PERSON_REPLY_DAYS = 7

export const InstagramAccount = Schema.Struct({
  /** Without the @. */
  username: Schema.String,
  name: Schema.String
})
export type InstagramAccount = typeof InstagramAccount.Type

export const InstagramStatus = Schema.Struct({
  /** Whether this server has a Meta app to connect accounts with. */
  configured: Schema.Boolean,
  /** The address Instagram sends new messages to. */
  publicUrl: Schema.NullOr(Schema.String),
  /** Whether that address answered the last check. Null before the first one. */
  reachable: Schema.NullOr(Schema.Boolean),
  account: Schema.NullOr(InstagramAccount),
  settings: ChannelSettings,
  connectedAt: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Schema.String),
  chatsToday: Schema.Int,
  drafts: Schema.Int
})
export type InstagramStatus = typeof InstagramStatus.Type

/** Where to sign in to Instagram and allow messages. It opens in the browser. */
export const InstagramLogin = Schema.Struct({
  url: Schema.String
})
export type InstagramLogin = typeof InstagramLogin.Type

/** One customer chat in the list. */
export const InstagramChat = Schema.Struct({
  id: ConversationId,
  agentId: AgentId,
  contactId: Schema.NullOr(ContactId),
  name: Schema.String,
  /** With the @. Empty while Instagram has not said it. */
  username: Schema.String,
  lastMessage: Schema.NullOr(ChatMessage),
  drafts: Schema.Int,
  handoff: Schema.NullOr(Schema.String),
  /** When the customer last wrote. The time to answer counts from it. */
  lastCustomerAt: Schema.NullOr(Schema.String)
})
export type InstagramChat = typeof InstagramChat.Type

/** The server has no Meta app, or no public address for Instagram to reach. */
export class InstagramNotConfigured extends Schema.TaggedError<InstagramNotConfigured>()(
  "InstagramNotConfigured",
  {},
  { httpApiStatus: 409 }
) {}

export class InstagramNotConnected extends Schema.TaggedError<InstagramNotConnected>()(
  "InstagramNotConnected",
  {},
  { httpApiStatus: 409 }
) {}

export class InstagramNeedsAgent extends Schema.TaggedError<InstagramNeedsAgent>()(
  "InstagramNeedsAgent",
  {},
  { httpApiStatus: 422 }
) {}

/** Too long since the customer wrote: Instagram no longer lets the business answer. */
export class InstagramWindowClosed extends Schema.TaggedError<InstagramWindowClosed>()(
  "InstagramWindowClosed",
  {},
  { httpApiStatus: 409 }
) {}

export class InstagramSendFailed extends Schema.TaggedError<InstagramSendFailed>()(
  "InstagramSendFailed",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}
