import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { ChannelAudience, ChannelSettings, defaultChannelSettings } from "./Channel.ts"
import { ChatMessage, ConversationId } from "./Chat.ts"
import { ContactId } from "./Contact.ts"

export const WhatsAppAudience = ChannelAudience
export type WhatsAppAudience = ChannelAudience

export const WhatsAppSettings = ChannelSettings
export type WhatsAppSettings = ChannelSettings

export const defaultWhatsAppSettings: WhatsAppSettings = defaultChannelSettings

/** `linking` waits for the phone, `linked` has a number, even while the connection is down. */
export const WhatsAppState = Schema.Literals(["unlinked", "linking", "linked"])
export type WhatsAppState = typeof WhatsAppState.Type

export const WhatsAppStatus = Schema.Struct({
  state: WhatsAppState,
  settings: WhatsAppSettings,
  /** The linked number, with a plus. */
  phone: Schema.NullOr(Schema.String),
  linkedAt: Schema.NullOr(Schema.String),
  /** Whether messages arrive right now. */
  online: Schema.Boolean,
  /** While linking with a QR code: its rows, `1` for a dark module. */
  qr: Schema.NullOr(Schema.Array(Schema.String)),
  /** While linking with a phone number: the code to type on the phone. */
  pairingCode: Schema.NullOr(Schema.String),
  /** Why the last link ended, for example when the phone removed the device. */
  problem: Schema.NullOr(Schema.String),
  chatsToday: Schema.Int,
  drafts: Schema.Int
})
export type WhatsAppStatus = typeof WhatsAppStatus.Type

export const LinkWhatsApp = Schema.Struct({
  /** Links with a code typed on the phone instead of a QR code. Digits with the country code. */
  phone: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\+?[\d\s()-]{8,20}$/)))
})
export type LinkWhatsApp = typeof LinkWhatsApp.Type

/** One customer chat in the list. */
export const WhatsAppChat = Schema.Struct({
  id: ConversationId,
  agentId: AgentId,
  contactId: Schema.NullOr(ContactId),
  name: Schema.String,
  /** Empty when WhatsApp hides the number. */
  phone: Schema.String,
  lastMessage: Schema.NullOr(ChatMessage),
  drafts: Schema.Int
})
export type WhatsAppChat = typeof WhatsAppChat.Type

export const SendWhatsApp = Schema.Struct({
  text: Schema.String.check(Schema.makeFilter((text) => text.trim() !== ""))
})
export type SendWhatsApp = typeof SendWhatsApp.Type

/** Sends a draft as it is, or with the text a person changed. */
export const SendDraft = Schema.Struct({
  text: Schema.optionalKey(Schema.String.check(Schema.makeFilter((text) => text.trim() !== "")))
})
export type SendDraft = typeof SendDraft.Type

export class WhatsAppNotLinked extends Schema.TaggedError<WhatsAppNotLinked>()(
  "WhatsAppNotLinked",
  {},
  { httpApiStatus: 409 }
) {}

/** Linking needs an employee to answer. */
export class WhatsAppNeedsAgent extends Schema.TaggedError<WhatsAppNeedsAgent>()(
  "WhatsAppNeedsAgent",
  {},
  { httpApiStatus: 422 }
) {}

export class DraftNotFound extends Schema.TaggedError<DraftNotFound>()("DraftNotFound", {}, { httpApiStatus: 404 }) {}

export class WhatsAppSendFailed extends Schema.TaggedError<WhatsAppSendFailed>()(
  "WhatsAppSendFailed",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}
