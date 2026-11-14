import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { ChannelSettings } from "./Channel.ts"
import { ChatMessage, ConversationId } from "./Chat.ts"
import { ContactId } from "./Contact.ts"

export const TelegramBot = Schema.Struct({
  /** Without the @. */
  username: Schema.String,
  name: Schema.String
})
export type TelegramBot = typeof TelegramBot.Type

/** A Telegram account that lets the bot answer in its own chats, through Telegram Business. */
export const TelegramBusiness = Schema.Struct({
  name: Schema.String,
  /** Without the @. Empty when the account has none. */
  username: Schema.String,
  /** Off when the owner switched the bot off or took away its right to reply. */
  enabled: Schema.Boolean
})
export type TelegramBusiness = typeof TelegramBusiness.Type

export const TelegramStatus = Schema.Struct({
  /** Null while no bot is connected. */
  bot: Schema.NullOr(TelegramBot),
  settings: ChannelSettings,
  connectedAt: Schema.NullOr(Schema.String),
  business: Schema.NullOr(TelegramBusiness),
  /** Whether messages arrive right now. */
  online: Schema.Boolean,
  /** Why the bot stopped, for example when its token was revoked. */
  problem: Schema.NullOr(Schema.String),
  chatsToday: Schema.Int,
  drafts: Schema.Int
})
export type TelegramStatus = typeof TelegramStatus.Type

export const ConnectTelegram = Schema.Struct({
  /** What @BotFather gives: digits, a colon and a long secret. */
  token: Schema.String.check(Schema.isPattern(/^\d{5,}:[\w-]{30,}$/))
})
export type ConnectTelegram = typeof ConnectTelegram.Type

/** One customer chat in the list. */
export const TelegramChat = Schema.Struct({
  id: ConversationId,
  agentId: AgentId,
  contactId: Schema.NullOr(ContactId),
  name: Schema.String,
  /** With the @. Empty when the customer has none. */
  username: Schema.String,
  /** To the bot, or in the business account's own chats. */
  via: Schema.Literals(["bot", "business"]),
  lastMessage: Schema.NullOr(ChatMessage),
  drafts: Schema.Int,
  /** Why a person has the chat now. The employee stays quiet until it is given back. */
  handoff: Schema.NullOr(Schema.String)
})
export type TelegramChat = typeof TelegramChat.Type

/** Telegram did not accept the token. */
export class TelegramTokenInvalid extends Schema.TaggedError<TelegramTokenInvalid>()(
  "TelegramTokenInvalid",
  {},
  { httpApiStatus: 422 }
) {}

export class TelegramNotConnected extends Schema.TaggedError<TelegramNotConnected>()(
  "TelegramNotConnected",
  {},
  { httpApiStatus: 409 }
) {}

export class TelegramNeedsAgent extends Schema.TaggedError<TelegramNeedsAgent>()(
  "TelegramNeedsAgent",
  {},
  { httpApiStatus: 422 }
) {}

export class TelegramSendFailed extends Schema.TaggedError<TelegramSendFailed>()(
  "TelegramSendFailed",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}
