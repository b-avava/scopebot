import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, Store } from "@scope-bot/db"
import {
  type AgentId,
  atZoned,
  defaultCalendarSettings,
  defaultWeekHours,
  emptyContactDetails,
  emptyServiceDetails,
  type SpecialistDetails
} from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { Calendar } from "../src/Calendar.ts"
import { Contacts } from "../src/Contacts.ts"
import { Deals } from "../src/Deals.ts"
import { Services } from "../src/Services.ts"

const layer = Calendar.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(Deals.layer, Contacts.layer, Services.layer)),
  Layer.provideMerge(CalendarStorage.layerMemory),
  Layer.provideMerge(Store.layerMemory)
)

const ZONE = "Asia/Tbilisi"
/** Monday 9 November 2026, 12:00 in Tbilisi. */
const MONDAY_NOON = Date.UTC(2026, 10, 9, 8, 0)
const at = (day: string, time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return atZoned(day, hours * 60 + minutes, ZONE).toISOString()
}

const person = { agentId: null, channel: null }
const employee = { agentId: "nino" as AgentId, channel: "whatsapp" as const }

const tamar = (serviceIds: SpecialistDetails["serviceIds"]): SpecialistDetails => ({
  name: "Tamar Beridze",
  title: "Dentist",
  color: "#2F9BCB",
  userId: null,
  active: true,
  hours: defaultWeekHours.map((day, index) =>
    index === 1 ? { ...day, breaks: [{ from: "13:00", to: "14:00" }] } : day
  ),
  serviceIds,
  timeOff: [{ from: "2026-11-13", to: "2026-11-13", note: "Conference" }]
})

/** A calendar that is on, one service of an hour and one specialist who does it. */
const setup = Effect.gen(function* () {
  yield* TestClock.setTime(MONDAY_NOON)
  const calendar = yield* Calendar
  const [pipeline] = yield* (yield* Deals).pipelines
  if (pipeline === undefined) return yield* Effect.die("no pipeline")
  const [, booked, , , won, lost] = pipeline.stages
  if (booked === undefined || won === undefined || lost === undefined) return yield* Effect.die("no stages")
  yield* calendar.saveSettings({
    ...defaultCalendarSettings,
    enabled: true,
    timeZone: ZONE,
    stageRules: { booked: booked.id, arrived: won.id, noShow: null, allCancelled: lost.id }
  })
  const service = yield* (yield* Services).create({ ...emptyServiceDetails, name: "Filling", price: 120, minutes: 60 })
  const specialist = yield* calendar.createSpecialist(tamar([service.id]))
  const contact = yield* (yield* Contacts).create({ ...emptyContactDetails, name: "Anna Kiknadze" })
  return { calendar, service, specialist, contact, stages: { booked, won, lost } }
})

describe("Calendar", () => {
  it.effect("is off until the business turns it on", () =>
    Effect.gen(function* () {
      const calendar = yield* Calendar
      const failed = yield* calendar
        .slots({ serviceId: null, specialistId: null, day: "2026-11-10", minutes: null })
        .pipe(Effect.flip)
      assert.strictEqual(failed._tag, "CalendarOff")
    }).pipe(Effect.provide(layer))
  )

  it.effect("offers only free times within the hours, outside breaks and days off", () =>
    Effect.gen(function* () {
      const { calendar, service, specialist } = yield* setup
      const query = { serviceId: service.id, specialistId: null, day: "2026-11-10", minutes: null }
      const before = (yield* calendar.slots(query)).map((slot) => slot.startsAt)
      assert.include(before, at("2026-11-10", "09:00"))
      assert.notInclude(before, at("2026-11-10", "12:30"), "Would run into the break")
      assert.notInclude(before, at("2026-11-10", "17:30"), "Would end after 18:00")

      yield* calendar.book(
        {
          specialistId: specialist.id,
          serviceId: service.id,
          contactId: null,
          dealId: null,
          startsAt: at("2026-11-10", "10:00"),
          minutes: null,
          note: ""
        },
        { bookedBy: person }
      )
      const after = (yield* calendar.slots(query)).map((slot) => slot.startsAt)
      assert.notInclude(after, at("2026-11-10", "10:00"))
      assert.notInclude(after, at("2026-11-10", "09:30"), "Would overlap the new booking")
      assert.include(after, at("2026-11-10", "11:00"))

      const friday = yield* calendar.slots({ ...query, day: "2026-11-13" })
      assert.deepStrictEqual(friday, [], "A day off has no times")
      const today = (yield* calendar.slots({ ...query, day: "2026-11-09" })).map((slot) => slot.startsAt)
      assert.notInclude(today, at("2026-11-09", "13:00"), "Sooner than two hours from now")
      assert.include(today, at("2026-11-09", "14:00"))
    }).pipe(Effect.provide(layer))
  )

  it.effect("never gives the same time twice, and keeps AI employees to the hours", () =>
    Effect.gen(function* () {
      const { calendar, service, specialist } = yield* setup
      const input = {
        specialistId: specialist.id,
        serviceId: service.id,
        contactId: null,
        dealId: null,
        startsAt: at("2026-11-10", "15:00"),
        minutes: null,
        note: ""
      }
      yield* calendar.book(input, { bookedBy: person })
      const twice = yield* calendar
        .book({ ...input, startsAt: at("2026-11-10", "15:30") }, { bookedBy: employee })
        .pipe(Effect.flip)
      assert.strictEqual(twice._tag, "TimeTaken")

      const late = { ...input, startsAt: at("2026-11-10", "19:00") }
      const refused = yield* calendar.book(late, { bookedBy: employee }).pipe(Effect.flip)
      assert.strictEqual(refused._tag, "TimeUnavailable")
      const walkIn = yield* calendar.book(late, { bookedBy: person })
      assert.strictEqual(walkIn.status, "booked", "A person may book outside the hours")
    }).pipe(Effect.provide(layer))
  )

  it.effect("starts a deal on booking and moves it with what happens", () =>
    Effect.gen(function* () {
      const { calendar, service, specialist, contact, stages } = yield* setup
      const deals = yield* Deals
      const first = yield* calendar.book(
        {
          specialistId: specialist.id,
          serviceId: service.id,
          contactId: contact.id,
          dealId: null,
          startsAt: at("2026-11-10", "09:00"),
          minutes: null,
          note: ""
        },
        { bookedBy: person }
      )
      const deal = (yield* deals.list).find((item) => item.id === first.dealId)
      assert.strictEqual(deal?.stageId, stages.booked.id)
      assert.strictEqual(deal?.title, "Filling · Anna Kiknadze")
      assert.strictEqual(deal?.amount, 120)

      yield* calendar.record(first.id, "arrived")
      assert.strictEqual((yield* deals.list).find((item) => item.id === first.dealId)?.stageId, stages.won.id)
      const again = yield* calendar.record(first.id, "confirmed").pipe(Effect.flip)
      assert.strictEqual(again._tag, "AppointmentClosed")
    }).pipe(Effect.provide(layer))
  )

  it.effect("moves a deal to the cancelled stage only when every appointment is cancelled", () =>
    Effect.gen(function* () {
      const { calendar, service, specialist, contact, stages } = yield* setup
      const deals = yield* Deals
      const base = {
        specialistId: specialist.id,
        serviceId: service.id,
        contactId: contact.id,
        minutes: null,
        note: ""
      }
      const first = yield* calendar.book(
        { ...base, dealId: null, startsAt: at("2026-11-10", "09:00") },
        { bookedBy: person }
      )
      const second = yield* calendar.book(
        { ...base, dealId: first.dealId, startsAt: at("2026-11-11", "09:00") },
        { bookedBy: person }
      )
      yield* calendar.cancel(first.id, "The client asked")
      assert.strictEqual((yield* deals.list).find((item) => item.id === first.dealId)?.stageId, stages.booked.id)
      yield* calendar.cancel(second.id, "")
      assert.strictEqual((yield* deals.list).find((item) => item.id === first.dealId)?.stageId, stages.lost.id)
      const slots = yield* calendar.slots({
        serviceId: service.id,
        specialistId: null,
        day: "2026-11-10",
        minutes: null
      })
      assert.include(
        slots.map((slot) => slot.startsAt),
        at("2026-11-10", "09:00"),
        "A cancelled time is free again"
      )
    }).pipe(Effect.provide(layer))
  )

  it.effect("keeps a time offered in a chat only for a while", () =>
    Effect.gen(function* () {
      const { calendar, service, specialist } = yield* setup
      const input = {
        specialistId: specialist.id,
        serviceId: service.id,
        contactId: null,
        dealId: null,
        startsAt: at("2026-11-10", "16:00"),
        minutes: null,
        note: ""
      }
      const held = yield* calendar.book(input, { bookedBy: employee, status: "held" })
      const blocked = yield* calendar.book(input, { bookedBy: person }).pipe(Effect.flip)
      assert.strictEqual(blocked._tag, "TimeTaken")

      yield* TestClock.adjust("16 minutes")
      yield* calendar.book(input, { bookedBy: person })
      const lost = yield* calendar.confirmHold(held.id, "booked").pipe(Effect.flip)
      assert.strictEqual(lost._tag, "TimeTaken", "The hold ran out and someone else took the time")
    }).pipe(Effect.provide(layer))
  )

  it.effect("books what an employee asked once a person agrees", () =>
    Effect.gen(function* () {
      const { calendar, service, specialist } = yield* setup
      const pending = yield* calendar.book(
        {
          specialistId: specialist.id,
          serviceId: service.id,
          contactId: null,
          dealId: null,
          startsAt: at("2026-11-11", "11:00"),
          minutes: null,
          note: ""
        },
        { bookedBy: employee, status: "pending" }
      )
      assert.strictEqual(pending.status, "pending")
      const approved = yield* calendar.approve(pending.id)
      assert.strictEqual(approved.status, "booked")
      const twice = yield* calendar.approve(pending.id).pipe(Effect.flip)
      assert.strictEqual(twice._tag, "AppointmentClosed")
    }).pipe(Effect.provide(layer))
  )
})
