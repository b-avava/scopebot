import { type ChannelChat, requireBusiness, Store } from "@scope-bot/db"
import {
  type Channel,
  type ChannelSettings,
  type ChatMessage,
  type Contact,
  type Conversation,
  ConversationId,
  ConversationNotFound,
  DraftNotFound,
  emptyContactDetails,
  type MessageId
} from "@scope-bot/domain"
import { Effect, Option, Semaphore } from "effect"
import { AgentChat, newMessage } from "./AgentChat.ts"
import { Agents, nowIso } from "./Agents.ts"
import { Contacts } from "./Contacts.ts"

/** A customer's message as every channel hands it over. */
export interface InboxMessage {
  /** The id the channel gave it. */
  readonly externalId: string
  /** Where to answer on the channel. */
  readonly address: string
  /** The name the customer set. Empty when there is none. */
  readonly name: string
  /** Digits with the country code, when the channel gives a number. */
  readonly phone: string | null
  /** Without the @, when the channel gives a username. */
  readonly username: string | null
  readonly text: string
}

/** Sends text to an address on the channel, and returns the id the channel gave it. */
export type SendText<E> = (address: string, text: string) => Effect.Effect<string, E>

const digits = (text: string) => text.replace(/\D/g, "")

/** `@anna`, `anna` and `https://t.me/anna` are the same person. */
const handleOf = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?t\.me\//, "")
    .replace(/^@/, "")

/** A new sender, as a contact owned by the employee who answers the channel. */
const newContact = (message: InboxMessage, settings: ChannelSettings, channel: Channel) => ({
  ...emptyContactDetails,
  name: fallbackName(message, channel),
  channels: {
    phone: "",
    whatsapp: message.phone === null ? "" : `+${message.phone}`,
    telegram: message.username === null ? "" : `@${message.username}`
  },
  ownerId: settings.agentId,
  source: channel === "whatsapp" ? "WhatsApp" : "Telegram"
})

const isToday = (iso: string, now: Date) => iso.slice(0, 10) === now.toISOString().slice(0, 10)

const sameCustomer = (contact: Contact, message: InboxMessage) => {
  if (message.phone !== null) {
    const number = message.phone
    return (
      digits(contact.channels.whatsapp) === number ||
      (contact.channels.whatsapp === "" && digits(contact.channels.phone) === number)
    )
  }
  return message.username !== null && handleOf(contact.channels.telegram) === message.username.toLowerCase()
}

const fallbackName = (message: InboxMessage, channel: Channel) => {
  if (message.name.trim() !== "") return message.name.trim()
  if (message.phone !== null) return `+${message.phone}`
  if (message.username !== null) return `@${message.username}`
  return channel === "whatsapp" ? "WhatsApp customer" : "Telegram customer"
}

/**
 * What every channel does with customers: turns senders into contacts and
 * chats, lets the employee answer or draft, and sends what people approve.
 * Only the way text reaches the channel differs, so it is passed in.
 */
export const makeInbox = (channel: Channel) =>
  Effect.gen(function* () {
    const store = yield* Store
    const chat = yield* AgentChat
    const agents = yield* Agents
    const contacts = yield* Contacts
    const locks = new Map<string, Semaphore.Semaphore>()

    // One customer's messages are handled one at a time, so a fast second
    // message cannot create the contact or the chat twice.
    const lockFor = (key: string) =>
      Effect.gen(function* () {
        const found = locks.get(key)
        if (found !== undefined) return found
        const lock = yield* Semaphore.make(1)
        locks.set(key, lock)
        return lock
      })

    const contactFor = (message: InboxMessage, settings: ChannelSettings) =>
      Effect.gen(function* () {
        const found = Option.fromNullishOr((yield* store.contacts).find((item) => sameCustomer(item, message)))
        if (Option.isSome(found) || settings.audience === "contacts") return found
        return yield* contacts.create(newContact(message, settings, channel)).pipe(Effect.option)
      })

    // The settings decide who answers now, and a contact found later is linked.
    const updateChat = (current: Conversation, agentId: Conversation["agentId"], contact: Option.Option<Contact>) => {
      const updated: Conversation = {
        ...current,
        agentId,
        ...(current.contactId === undefined && Option.isSome(contact) ? { contactId: contact.value.id } : {})
      }
      const changed = updated.agentId !== current.agentId || updated.contactId !== current.contactId
      return (changed ? store.saveConversation(updated) : Effect.void).pipe(Effect.as(updated))
    }

    const newChat = (message: InboxMessage, agentId: Conversation["agentId"], contact: Option.Option<Contact>) =>
      Effect.gen(function* () {
        const created: Conversation = {
          id: ConversationId.make(crypto.randomUUID()),
          agentId,
          title: Option.match(contact, { onNone: () => fallbackName(message, channel), onSome: (item) => item.name }),
          createdAt: yield* nowIso,
          channel,
          address: message.address,
          ...(Option.isSome(contact) ? { contactId: contact.value.id } : {})
        }
        yield* store.saveConversation(created)
        return created
      })

    const chatFor = (message: InboxMessage, agentId: Conversation["agentId"], contact: Option.Option<Contact>) =>
      store.findChannelConversation(channel, message.address).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => newChat(message, agentId, contact),
            onSome: (current) => updateChat(current, agentId, contact)
          })
        )
      )

    /** Sends a stored message, and keeps whether it reached the customer. */
    const deliver = <E>(conversation: Conversation, message: ChatMessage, sendText: SendText<E>) =>
      Effect.gen(function* () {
        const sentId = yield* sendText(conversation.address ?? "", message.text).pipe(
          Effect.tapError(() => store.saveMessage({ ...message, delivery: "failed" }))
        )
        const sent: ChatMessage = { ...message, delivery: "sent", ...(sentId === "" ? {} : { externalId: sentId }) }
        yield* store.saveMessage(sent)
        return sent
      })

    const note = (conversation: Conversation, text: string) =>
      newMessage(conversation.agentId, conversation.id, "note", text).pipe(Effect.flatMap(store.appendMessage))

    const answer = <E>(conversation: Conversation, message: InboxMessage, alone: boolean, sendText: SendText<E>) =>
      chat
        .send(conversation.agentId, conversation.id, message.text, [], {
          externalId: message.externalId,
          replyAs: alone ? "sending" : "draft"
        })
        .pipe(
          Effect.flatMap((sent) =>
            alone && sent.reply !== null ? deliver(conversation, sent.reply, sendText).pipe(Effect.ignore) : Effect.void
          ),
          Effect.catch((error) => note(conversation, `No reply was written: ${error._tag}.`))
        )

    /** Stored for people to answer, with no reply from the employee. */
    const keep = (conversation: Conversation, message: InboxMessage) =>
      newMessage(conversation.agentId, conversation.id, "customer", message.text, [], {
        externalId: message.externalId
      }).pipe(Effect.flatMap(store.appendMessage))

    /** The employee who answers the channel, if one is set and still works here. */
    const agentFor = (settings: ChannelSettings) =>
      settings.agentId === null ? Effect.succeed(Option.none()) : agents.get(settings.agentId).pipe(Effect.option)

    const handleMessage = <E>(message: InboxMessage, settings: ChannelSettings, sendText: SendText<E>) =>
      Effect.gen(function* () {
        if (Option.isSome(yield* store.findExternalMessage(message.externalId))) return "handled" as const
        const agent = yield* agentFor(settings)
        if (Option.isNone(agent)) return "no-agent" as const
        const contact = yield* contactFor(message, settings)
        const conversation = yield* chatFor(message, agent.value.id, contact)
        const answers = agent.value.active && (settings.audience === "everyone" || Option.isSome(contact))
        yield* answers ? answer(conversation, message, settings.answersAlone, sendText) : keep(conversation, message)
        return "handled" as const
      })

    const findChat = (id: ConversationId) =>
      store
        .findConversation(id)
        .pipe(
          Effect.flatMap((found) =>
            Option.isSome(found) && found.value.channel === channel
              ? Effect.succeed(found.value)
              : Effect.fail(new ConversationNotFound())
          )
        )

    const findDraft = (id: MessageId) =>
      Effect.gen(function* () {
        const found = yield* store.findMessage(id)
        if (Option.isNone(found) || found.value.delivery !== "draft") return yield* new DraftNotFound()
        const conversation = yield* findChat(found.value.conversationId).pipe(
          Effect.mapError(() => new DraftNotFound())
        )
        return { message: found.value, conversation }
      })

    const audit = (message: ChatMessage, summary: string) =>
      nowIso.pipe(
        Effect.flatMap((createdAt) =>
          store.appendAction({
            id: crypto.randomUUID(),
            agentId: message.agentId,
            tool: "reply",
            status: "done",
            summary,
            sourceMessageId: message.id,
            model: "",
            inputTokens: 0,
            outputTokens: 0,
            createdAt
          })
        )
      )

    return {
      /** Handles a message from a customer. Says when no employee answers the channel. */
      receive: <E>(message: InboxMessage, settings: ChannelSettings, sendText: SendText<E>) =>
        Effect.gen(function* () {
          const business = yield* requireBusiness
          const lock = yield* lockFor(`${business}:${message.address}`)
          return yield* Semaphore.withPermit(lock, handleMessage(message, settings, sendText))
        }),
      /** Every chat on the channel with its contact, newest first. */
      chats: Effect.gen(function* () {
        const list = yield* store.contacts
        return (yield* store.channelChats(channel)).map((item: ChannelChat) => ({
          ...item,
          contact: list.find((contact) => contact.id === item.conversation.contactId)
        }))
      }),
      counts: store.channelChats(channel).pipe(
        Effect.map((chats) => {
          const now = new Date()
          return {
            chatsToday: chats.filter((item) => item.lastMessage !== null && isToday(item.lastMessage.createdAt, now))
              .length,
            drafts: chats.reduce((total, item) => total + item.drafts, 0)
          }
        })
      ),
      findChat,
      messages: (chatId: ConversationId) => findChat(chatId).pipe(Effect.andThen(store.conversationMessages(chatId))),
      /** A person from the team writes to the customer themselves. */
      write: <E>(chatId: ConversationId, text: string, sendText: SendText<E>) =>
        Effect.gen(function* () {
          const conversation = yield* findChat(chatId)
          const message = yield* newMessage(conversation.agentId, conversation.id, "person", text.trim(), [], {
            delivery: "sending"
          })
          yield* store.appendMessage(message)
          return yield* deliver(conversation, message, sendText)
        }),
      sendDraft: <E>(id: MessageId, text: string | undefined, sendText: SendText<E>) =>
        Effect.gen(function* () {
          const { message, conversation } = yield* findDraft(id)
          const changed = text !== undefined && text.trim() !== message.text
          const sending: ChatMessage = { ...message, text: changed ? text.trim() : message.text, delivery: "sending" }
          yield* store.saveMessage(sending)
          const sent = yield* deliver(conversation, sending, sendText)
          yield* audit(
            sent,
            changed ? "A person changed the drafted reply and sent it" : "A person sent the drafted reply"
          )
          return sent
        }),
      discardDraft: (id: MessageId) =>
        Effect.gen(function* () {
          const { message } = yield* findDraft(id)
          const discarded: ChatMessage = { ...message, delivery: "discarded" }
          yield* store.saveMessage(discarded)
          yield* audit(discarded, "A person threw the drafted reply away")
          return discarded
        })
    }
  })
