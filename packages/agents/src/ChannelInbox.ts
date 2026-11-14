import { type ChannelChat, CurrentViewer, requireBusiness, Store } from "@scope-bot/db"
import {
  type AgentAction,
  type Appointment,
  AppointmentClosed,
  type AppointmentStep,
  CalendarOff,
  type Channel,
  type ChannelSettings,
  type ChatMessage,
  type Contact,
  type Conversation,
  ConversationId,
  ConversationNotFound,
  DraftNotFound,
  emptyContactDetails,
  type MessageId,
  TimeTaken,
  TimeUnavailable
} from "@scope-bot/domain"
import { Effect, Option, Semaphore } from "effect"
import { AgentChat, newMessage } from "./AgentChat.ts"
import { Agents, nowIso } from "./Agents.ts"
import { Calendar } from "./Calendar.ts"
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

/** Why a drafted reply was not sent: what it does to an appointment could not be done. */
export type AppointmentStepError = TimeTaken | TimeUnavailable | AppointmentClosed | CalendarOff

/**
 * Does what a reply says to an appointment, as a person who agreed to it, so a
 * person's rules apply. Returns the appointment as it is now.
 */
export const applyStep = (
  calendar: Calendar["Service"],
  step: AppointmentStep,
  channel: Channel | null
): Effect.Effect<Appointment, AppointmentStepError> => {
  const done: Effect.Effect<Appointment, { readonly _tag: string }> =
    step.kind === "book"
      ? calendar.confirmHold(step.appointmentId, "booked")
      : step.kind === "move"
        ? calendar.move(
            step.appointmentId,
            { specialistId: step.specialistId, startsAt: step.startsAt },
            { bookedBy: { agentId: null, channel } }
          )
        : calendar.cancel(step.appointmentId, step.reason)
  return done.pipe(
    Effect.mapError(
      (error): AppointmentStepError =>
        error instanceof TimeTaken || error instanceof TimeUnavailable || error instanceof CalendarOff
          ? error
          : new AppointmentClosed()
    )
  )
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
    telegram: channel === "telegram" && message.username !== null ? `@${message.username}` : ""
  },
  ownerId: settings.agentId,
  source: channelNames[channel]
})

const isToday = (iso: string, now: Date) => iso.slice(0, 10) === now.toISOString().slice(0, 10)

/** Contacts keep a number and a Telegram username, so only those find a person again. */
const sameCustomer = (contact: Contact, message: InboxMessage, channel: Channel) => {
  if (message.phone !== null) {
    const number = message.phone
    return (
      digits(contact.channels.whatsapp) === number ||
      (contact.channels.whatsapp === "" && digits(contact.channels.phone) === number)
    )
  }
  return (
    channel === "telegram" &&
    message.username !== null &&
    handleOf(contact.channels.telegram) === message.username.toLowerCase()
  )
}

const channelNames: Record<Channel, string> = { whatsapp: "WhatsApp", telegram: "Telegram", instagram: "Instagram" }

const fallbackName = (message: InboxMessage, channel: Channel) => {
  if (message.name.trim() !== "") return message.name.trim()
  if (message.phone !== null) return `+${message.phone}`
  if (message.username !== null) return `@${message.username}`
  return `${channelNames[channel]} customer`
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
    const calendar = yield* Calendar
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
        const list = yield* store.contacts
        // A sender the channel gives no number or username for is known by their chat.
        const chat = yield* store.findChannelConversation(channel, message.address)
        const known = Option.flatMap(chat, (item) =>
          Option.fromNullishOr(list.find((contact) => contact.id === item.contactId))
        )
        if (Option.isSome(known)) return known
        const found = Option.fromNullishOr(list.find((item) => sameCustomer(item, message, channel)))
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

    const handOver = (message: ChatMessage, reason: string) =>
      Effect.gen(function* () {
        yield* store.appendEscalation({
          id: crypto.randomUUID(),
          agentId: message.agentId,
          conversationId: message.conversationId,
          reason,
          createdAt: yield* nowIso,
          resolvedAt: null
        })
        yield* audit(message, `Handed to a human: ${reason}`, { tool: "handoff" })
      })

    // A person sending the draft agrees to what it does, so a person's rules apply.
    const doStep = (step: AppointmentStep) => applyStep(calendar, step, channel).pipe(Effect.asVoid)

    const stepText = { book: "booked the time", move: "moved the appointment", cancel: "cancelled the appointment" }

    const sentSummary = (message: ChatMessage, changed: boolean) =>
      [
        changed ? "A person changed the drafted reply and sent it" : "A person sent the drafted reply",
        message.appointment === undefined ? "" : `, and ${stepText[message.appointment.kind]}`
      ].join("")

    const audit = (message: ChatMessage, summary: string, extra: Partial<AgentAction> = {}) =>
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
            createdAt,
            conversationId: message.conversationId,
            ...extra
          })
        )
      )

    /** The person whose click sent or threw away a draft. Background work has none. */
    const decidedBy = (agreed: boolean) =>
      CurrentViewer.pipe(
        Effect.map(
          (viewer): Partial<AgentAction> =>
            viewer === null ? {} : { decidedBy: { userId: viewer.userId, name: viewer.name, agreed } }
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
      /** The employee writes first, like a reminder, with no person checking it. */
      notify: <E>(chatId: ConversationId, text: string, summary: string, sendText: SendText<E>) =>
        Effect.gen(function* () {
          const conversation = yield* findChat(chatId)
          const message = yield* newMessage(conversation.agentId, conversation.id, "agent", text, [], {
            delivery: "sending"
          })
          yield* store.appendMessage(message)
          const sent = yield* deliver(conversation, message, sendText)
          yield* audit(sent, summary)
          return sent
        }),
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
          // The appointment changes first: a reply that says "booked" must not go out when it was not.
          if (message.appointment !== undefined) yield* doStep(message.appointment)
          const sending: ChatMessage = {
            ...message,
            text: changed ? (text ?? "").trim() : message.text,
            delivery: "sending"
          }
          yield* store.saveMessage(sending)
          const sent = yield* deliver(conversation, sending, sendText)
          yield* audit(sent, sentSummary(message, changed), yield* decidedBy(true))
          // The customer now hears that a colleague takes over, so a person does.
          if (sent.handoff !== undefined) yield* handOver(sent, sent.handoff)
          return sent
        }),
      /** Gives a chat a person took over back to the employee. */
      resume: (chatId: ConversationId) =>
        Effect.gen(function* () {
          yield* findChat(chatId)
          yield* store.resolveEscalation(chatId, yield* nowIso)
        }),
      discardDraft: (id: MessageId) =>
        Effect.gen(function* () {
          const { message } = yield* findDraft(id)
          const discarded: ChatMessage = { ...message, delivery: "discarded" }
          yield* store.saveMessage(discarded)
          // A time held for this reply is let go at once, not when the hold runs out.
          if (message.appointment?.kind === "book") {
            yield* calendar.releaseHold(message.appointment.appointmentId)
          }
          yield* audit(discarded, "A person threw the drafted reply away", yield* decidedBy(false))
          return discarded
        })
    }
  })
