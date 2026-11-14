import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, Store } from "@scope-bot/db"
import {
  AgentId,
  type AppointmentId,
  atZoned,
  type BookedBy,
  type Channel,
  ConversationId,
  defaultCalendarSettings,
  defaultWeekHours,
  emptyContactDetails,
  emptyServiceDetails,
  MessageId
} from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { Calendar } from "../src/Calendar.ts"
import { Contacts } from "../src/Contacts.ts"
import { Deals } from "../src/Deals.ts"
import { fillReminder, ReminderSenders, Reminders } from "../src/Reminders.ts"
import { Services } from "../src/Services.ts"

const ZONE = "Asia/Tbilisi"
const at = (day: string, time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return atZoned(day, hours * 60 + minutes, ZONE)
}

interface Sent {
  readonly channel: Channel
  readonly chatId: string
  readonly text: string
}

const fakeSenders = (sent: Array<Sent>, failWith: string | null = null) => {
  const notify = (channel: Channel) => (chatId: ConversationId, text: string) =>
    failWith === null ? Effect.sync(() => sent.push({ channel, chatId, text })) : Effect.fail({ _tag: failWith })
  return Layer.succeed(
    ReminderSenders,
    ReminderSenders.of({ whatsapp: notify("whatsapp"), telegram: notify("telegram"), instagram: notify("instagram") })
  )
}

const layerWith = (sent: Array<Sent>, failWith: string | null = null) =>
  Reminders.layer.pipe(
    Layer.provideMerge(Calendar.layer),
    Layer.provideMerge(Layer.mergeAll(Deals.layer, Contacts.layer, Services.layer)),
    Layer.provide(fakeSenders(sent, failWith)),
    Layer.provideMerge(CalendarStorage.layerMemory),
    Layer.provideMerge(Store.layerMemory)
  )

const inChat: BookedBy = { agentId: AgentId.make("nino"), channel: "whatsapp" }
const byPerson: BookedBy = { agentId: null, channel: null }

/**
 * On Sunday 8 November at 9:00, Anna books a filling for Tuesday at 11:00, and she has a
 * WhatsApp chat with the business.
 */
const setup = (bookedBy: BookedBy = inChat, bookedAt = at("2026-11-08", "09:00")) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(bookedAt.getTime())
    const calendar = yield* Calendar
    const store = yield* Store
    yield* calendar.saveSettings({ ...defaultCalendarSettings, enabled: true, timeZone: ZONE })
    const service = yield* (yield* Services).create({ ...emptyServiceDetails, name: "Filling", minutes: 60 })
    const specialist = yield* calendar.createSpecialist({
      name: "Tamar Beridze",
      title: "Dentist",
      color: "#2F9BCB",
      userId: null,
      active: true,
      hours: defaultWeekHours,
      serviceIds: [service.id],
      timeOff: []
    })
    const contact = yield* (yield* Contacts).create({ ...emptyContactDetails, name: "Anna Kiknadze" })
    const chatId = ConversationId.make("wa-anna")
    yield* store.saveConversation({
      id: chatId,
      agentId: AgentId.make("nino"),
      title: "Anna Kiknadze",
      createdAt: bookedAt.toISOString(),
      channel: "whatsapp",
      address: "995577204518@s.whatsapp.net",
      contactId: contact.id
    })
    yield* store.appendMessage({
      id: MessageId.make("m-1"),
      agentId: AgentId.make("nino"),
      conversationId: chatId,
      role: "customer",
      text: "Can I come on Tuesday?",
      createdAt: bookedAt.toISOString()
    })
    const appointment = yield* calendar.book(
      {
        specialistId: specialist.id,
        serviceId: service.id,
        contactId: contact.id,
        dealId: null,
        startsAt: at("2026-11-10", "11:00").toISOString(),
        minutes: null,
        note: ""
      },
      { bookedBy }
    )
    return { calendar, store, contact, appointment, specialist }
  })

const tickAt = (moment: Date) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(moment.getTime())
    yield* (yield* Reminders).tick
  })

const logsOf = (id: AppointmentId) => Calendar.use((calendar) => calendar.reminders(id))

describe("Reminders", () => {
  it("fills the text and tidies what an empty value leaves", () => {
    assert.strictEqual(
      fillReminder("See you at {time}, {address}.", { time: "11:00", address: "" }),
      "See you at 11:00."
    )
    assert.strictEqual(fillReminder("Hi {name}! {unknown}", { name: "Anna" }), "Hi Anna! {unknown}")
  })

  it.effect("sends each reminder once, when it is due, to the chat the client booked from", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { appointment } = yield* setup()
      yield* tickAt(at("2026-11-09", "10:00"))
      assert.deepStrictEqual(sent, [], "Too early for the day-before reminder")

      yield* tickAt(at("2026-11-09", "11:30"))
      yield* tickAt(at("2026-11-09", "11:31"))
      assert.deepStrictEqual(sent, [
        {
          channel: "whatsapp",
          chatId: "wa-anna",
          text: "Hi Anna! A reminder: Filling with Tamar Beridze on Tue 10 Nov at 11:00. Reply 1 to confirm or 2 to move it."
        }
      ])

      yield* tickAt(at("2026-11-10", "09:15"))
      assert.strictEqual(sent.at(-1)?.text, "See you at 11:00.")
      assert.strictEqual(sent.length, 2)
      const logs = yield* logsOf(appointment.id)
      assert.deepStrictEqual(logs.map((log) => [log.minutesBefore, log.outcome]).sort(), [
        [120, "sent"],
        [1440, "sent"]
      ])
    }).pipe(Effect.provide(layerWith(sent)))
  })

  it.effect("after a pause sends only the closest reminder", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { appointment } = yield* setup()
      yield* tickAt(at("2026-11-10", "09:30"))
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0]?.text, "See you at 11:00.")
      const skipped = (yield* logsOf(appointment.id)).find((log) => log.minutesBefore === 1440)
      assert.strictEqual(skipped?.outcome, "skipped")
    }).pipe(Effect.provide(layerWith(sent)))
  })

  it.effect("does not message first a client who booked by phone and did not agree to it", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { appointment } = yield* setup(byPerson)
      yield* tickAt(at("2026-11-09", "11:30"))
      assert.deepStrictEqual(sent, [])
      const [log] = yield* logsOf(appointment.id)
      assert.strictEqual(log?.outcome, "skipped")
      assert.strictEqual(log?.reason, "The client did not agree to be messaged first")
    }).pipe(Effect.provide(layerWith(sent)))
  })

  it.effect("messages a client who agreed to it, wherever the booking came from", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { store, contact } = yield* setup(byPerson)
      yield* store.saveContact({ ...contact, consent: { messages: true, marketing: false } })
      yield* tickAt(at("2026-11-09", "11:30"))
      assert.strictEqual(sent.length, 1)
    }).pipe(Effect.provide(layerWith(sent)))
  })

  it.effect("skips a reminder whose time had passed when the appointment was booked", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { appointment } = yield* setup(inChat, at("2026-11-09", "16:00"))
      yield* tickAt(at("2026-11-09", "16:01"))
      assert.deepStrictEqual(sent, [])
      const [log] = yield* logsOf(appointment.id)
      assert.strictEqual(log?.reason, "Booked after the time of this reminder")
      yield* tickAt(at("2026-11-10", "09:00"))
      assert.strictEqual(sent.length, 1, "The two-hour one still goes")
    }).pipe(Effect.provide(layerWith(sent)))
  })

  it.effect("reminds again of a new time after a move", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { calendar, appointment, specialist } = yield* setup()
      yield* tickAt(at("2026-11-09", "11:30"))
      yield* calendar.move(
        appointment.id,
        { specialistId: specialist.id, startsAt: at("2026-11-10", "15:00").toISOString() },
        { bookedBy: byPerson }
      )
      yield* tickAt(at("2026-11-09", "15:30"))
      assert.strictEqual(sent.length, 2)
      assert.include(sent[1]?.text ?? "", "at 15:00")
    }).pipe(Effect.provide(layerWith(sent)))
  })

  it.effect("keeps why a reminder failed and does not try again", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { appointment } = yield* setup()
      yield* tickAt(at("2026-11-09", "11:30"))
      yield* tickAt(at("2026-11-09", "11:31"))
      const logs = yield* logsOf(appointment.id)
      assert.strictEqual(logs.length, 1)
      assert.strictEqual(logs[0]?.outcome, "failed")
      assert.strictEqual(logs[0]?.reason, "Instagram lets a business write only within 24 hours of the client")
    }).pipe(Effect.provide(layerWith(sent, "InstagramWindowClosed")))
  })

  it.effect("sends nothing for cancelled appointments or while the calendar is off", () => {
    const sent: Array<Sent> = []
    return Effect.gen(function* () {
      const { calendar, appointment } = yield* setup()
      yield* calendar.saveSettings({ ...(yield* calendar.settings), enabled: false })
      yield* tickAt(at("2026-11-09", "11:30"))
      yield* calendar.saveSettings({ ...(yield* calendar.settings), enabled: true })
      yield* calendar.cancel(appointment.id, "")
      yield* tickAt(at("2026-11-09", "11:40"))
      assert.deepStrictEqual(sent, [])
    }).pipe(Effect.provide(layerWith(sent)))
  })
})
