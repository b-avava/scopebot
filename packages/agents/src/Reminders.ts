import { CalendarStorage, CurrentBusiness, Store } from "@scope-bot/db"
import {
  type Appointment,
  addMinutes,
  type BusinessId,
  type CalendarSettings,
  type Channel,
  type ConversationId,
  describeTime,
  type Reminder,
  type ReminderLog
} from "@scope-bot/domain"
import { Clock, Context, Effect, FiberSet, Layer, Option } from "effect"
import { Instagram } from "./Instagram.ts"
import { Telegram } from "./Telegram.ts"
import { WhatsApp } from "./WhatsApp.ts"

const TICK_MS = 60 * 1000
const MINUTE_MS = 60 * 1000
const CHANNELS: ReadonlyArray<Channel> = ["whatsapp", "telegram", "instagram"]
const channelNames: Record<Channel, string> = { whatsapp: "WhatsApp", telegram: "Telegram", instagram: "Instagram" }

/** Writes first to a customer's chat on one channel, as its employee. */
export type Notify = (
  chatId: ConversationId,
  text: string,
  summary: string
) => Effect.Effect<unknown, { readonly _tag: string }>

/** How reminders reach each channel. The channels give it, tests fake it. */
export class ReminderSenders extends Context.Service<ReminderSenders, Readonly<Record<Channel, Notify>>>()(
  "@scope-bot/agents/ReminderSenders"
) {
  static readonly layer = Layer.effect(
    ReminderSenders,
    Effect.gen(function* () {
      const whatsapp = yield* WhatsApp
      const telegram = yield* Telegram
      const instagram = yield* Instagram
      return ReminderSenders.of({ whatsapp: whatsapp.notify, telegram: telegram.notify, instagram: instagram.notify })
    })
  )
}

/** Why a reminder could not go out, in words a person reads on the appointment. */
const failureText = (channel: Channel, tag: string) => {
  if (tag === "InstagramWindowClosed") return "Instagram lets a business write only within 24 hours of the client"
  if (tag.endsWith("NotLinked") || tag.endsWith("NotConnected")) return `${channelNames[channel]} is not connected`
  return `${channelNames[channel]} did not take the message`
}

const skipped = (reason: string): Told => ({ outcome: "skipped", reason, channel: null })

/** Fills {name}, {service}, {specialist}, {date}, {time} and {address}, and tidies what an empty one leaves. */
export const fillReminder = (text: string, values: Readonly<Record<string, string>>) =>
  text
    .replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
    .replace(/\s*,\s*([.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()

/** The reminders due now that were not taken care of yet, the closest first. */
const dueReminders = (
  appointment: Appointment,
  reminders: ReadonlyArray<Reminder>,
  logs: ReadonlyArray<ReminderLog>,
  now: number
) => {
  const start = Date.parse(appointment.startsAt)
  const handled = (reminder: Reminder) =>
    logs.some(
      (log) =>
        log.appointmentId === appointment.id &&
        Date.parse(log.startsAt) === start &&
        log.minutesBefore === reminder.minutesBefore
    )
  return reminders
    .filter((reminder) => !handled(reminder) && now >= start - reminder.minutesBefore * MINUTE_MS)
    .sort((a, b) => a.minutesBefore - b.minutesBefore)
}

/** What happened to a message for a client, and on which channel. */
export interface Told {
  readonly outcome: "sent" | "skipped" | "failed"
  /** Why it was skipped or failed. Empty when sent. */
  readonly reason: string
  readonly channel: Channel | null
}

/** Reminds clients of their appointments on the channel they write from, and tells them of changes. */
export class Reminders extends Context.Service<
  Reminders,
  {
    /** Sends what is due now in the current business. Nothing goes twice. */
    readonly tick: Effect.Effect<void>
    /** Tells the client their appointment moved or was cancelled, with the calendar's notice texts. */
    tell(appointment: Appointment, notice: keyof CalendarSettings["notices"]): Effect.Effect<Told>
  }
>()("@scope-bot/agents/Reminders") {
  static readonly layer = Layer.effect(
    Reminders,
    Effect.gen(function* () {
      const storage = yield* CalendarStorage
      const store = yield* Store
      const senders = yield* ReminderSenders

      /** The client's chat to write to: the one they booked from, or the one they wrote in last. */
      const chatOf = Effect.fn("Reminders.chatOf")(function* (appointment: Appointment) {
        const chats = (yield* Effect.forEach(CHANNELS, (channel) =>
          store
            .channelChats(channel)
            .pipe(
              Effect.map((list) =>
                list
                  .filter((item) => item.conversation.contactId === appointment.contactId)
                  .map((item) => ({ channel, id: item.conversation.id, at: item.lastCustomerAt ?? "" }))
              )
            )
        )).flat()
        const booked = chats.filter((item) => item.channel === appointment.bookedBy.channel)
        return [...(booked.length > 0 ? booked : chats)].sort((a, b) => b.at.localeCompare(a.at))[0]
      })

      /** Sends a text about an appointment to its client, and says what happened. */
      const deliver = Effect.fn("Reminders.deliver")(function* (
        appointment: Appointment,
        template: string,
        settings: CalendarSettings,
        summaryOf: (name: string, what: string) => string
      ) {
        const contact =
          appointment.contactId === null
            ? undefined
            : Option.getOrUndefined(yield* store.findContact(appointment.contactId))
        if (contact === undefined) return skipped("The client is no longer in the CRM")
        // Someone who booked in a chat expects to hear about it there. Anyone else must have agreed to it.
        if (!contact.consent.messages && appointment.bookedBy.channel === null) {
          return skipped("The client did not agree to be messaged first")
        }
        const chat = yield* chatOf(appointment)
        if (chat === undefined) {
          return skipped("No chat with the client on WhatsApp, Telegram or Instagram")
        }
        const service = Option.getOrUndefined(
          appointment.serviceId === null ? Option.none() : yield* store.findService(appointment.serviceId)
        )
        const specialist = Option.getOrUndefined(yield* storage.findSpecialist(appointment.specialistId))
        const [date = "", time = ""] = describeTime(appointment.startsAt, settings.timeZone).split(", ")
        const text = fillReminder(template, {
          name: contact.name.split(" ")[0] ?? contact.name,
          service: service?.name ?? "your appointment",
          specialist: specialist?.name ?? "us",
          date,
          time,
          address: (yield* store.business).address
        })
        const summary = summaryOf(contact.name, `${service?.name ?? "an appointment"} on ${date}, ${time}`)
        return yield* senders[chat.channel](chat.id, text, summary).pipe(
          Effect.as<Told>({ outcome: "sent", reason: "", channel: chat.channel }),
          Effect.catch((error) =>
            Effect.succeed<Told>({
              outcome: "failed",
              reason: failureText(chat.channel, error._tag),
              channel: chat.channel
            })
          )
        )
      })

      const send = (appointment: Appointment, reminder: Reminder, settings: CalendarSettings) =>
        deliver(appointment, reminder.text, settings, (name, what) => `Reminded ${name} of ${what}`)

      const remind = Effect.fn("Reminders.remind")(function* (
        appointment: Appointment,
        settings: CalendarSettings,
        logs: ReadonlyArray<ReminderLog>,
        now: number
      ) {
        const [closest, ...passed] = dueReminders(
          appointment,
          settings.reminders.filter((item) => item.enabled),
          logs,
          now
        )
        if (closest === undefined) return
        const at = new Date(now).toISOString()
        const log = (reminder: Reminder, outcome: ReminderLog["outcome"], reason: string): ReminderLog => ({
          appointmentId: appointment.id,
          startsAt: appointment.startsAt,
          minutesBefore: reminder.minutesBefore,
          outcome,
          reason,
          at
        })
        // Only the closest one goes: after a pause, the earlier ones would only repeat it.
        for (const reminder of passed)
          yield* storage.claimReminder(log(reminder, "skipped", "A later reminder took its place"))
        const start = Date.parse(appointment.startsAt)
        if (Date.parse(appointment.createdAt) > start - closest.minutesBefore * MINUTE_MS) {
          yield* storage.claimReminder(log(closest, "skipped", "Booked after the time of this reminder"))
          return
        }
        // Claimed before it goes out, so it never goes twice, even if the server stops right after.
        if (!(yield* storage.claimReminder(log(closest, "sent", "")))) return
        const result = yield* send(appointment, closest, settings)
        if (result.outcome !== "sent") yield* storage.saveReminder(log(closest, result.outcome, result.reason))
      })

      return Reminders.of({
        tell: (appointment, notice) =>
          storage.settings.pipe(
            Effect.flatMap((settings) =>
              deliver(appointment, settings.notices[notice], settings, (name, what) =>
                notice === "moved"
                  ? `Told ${name} that ${what} is the new time`
                  : `Told ${name} that ${what} is cancelled`
              )
            )
          ),
        tick: Effect.gen(function* () {
          const settings = yield* storage.settings
          const active = settings.reminders.filter((item) => item.enabled)
          if (!settings.enabled || active.length === 0) return
          const now = yield* Clock.currentTimeMillis
          const longest = Math.max(...active.map((item) => item.minutesBefore))
          const upcoming = (yield* storage.appointments({
            from: new Date(now).toISOString(),
            to: addMinutes(new Date(now), longest).toISOString()
          })).filter(
            (item) =>
              (item.status === "booked" || item.status === "confirmed") &&
              item.contactId !== null &&
              Date.parse(item.startsAt) > now
          )
          if (upcoming.length === 0) return
          const logs = yield* storage.reminders(upcoming.map((item) => item.id))
          yield* Effect.forEach(upcoming, (item) => remind(item, settings, logs, now), { discard: true })
        })
      })
    })
  )

  /** Reminders, and the loop that sends them every minute for every business with the calendar on. */
  static readonly layerRunning = Layer.effectDiscard(
    Effect.gen(function* () {
      const reminders = yield* Reminders
      const storage = yield* CalendarStorage
      const run = yield* FiberSet.makeRuntime()
      const once = (business: BusinessId) =>
        reminders.tick.pipe(
          Effect.provideService(CurrentBusiness, business),
          Effect.catchCause((cause) => Effect.logWarning("Reminders failed", cause))
        )
      run(
        Effect.gen(function* () {
          while (true) {
            yield* Effect.forEach(yield* storage.enabledBusinesses, once, { discard: true })
            yield* Effect.sleep(TICK_MS)
          }
        })
      )
    })
  ).pipe(Layer.provideMerge(Reminders.layer))
}
