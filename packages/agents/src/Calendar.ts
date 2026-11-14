import { CalendarStorage, isBusy, Store } from "@scope-bot/db"
import {
  AgentNotFound,
  type Appointment,
  AppointmentClosed,
  AppointmentId,
  AppointmentNotFound,
  type AppointmentOutcome,
  type AppointmentStatus,
  addMinutes,
  atZoned,
  type BookedBy,
  CalendarOff,
  type CalendarSettings,
  ContactNotFound,
  type Deal,
  type DealId,
  DealNotFound,
  DealStageNotFound,
  dayOf,
  describeTime,
  isTimeZone,
  type MoveAppointment,
  minutesOf,
  type NewAppointment,
  ReferenceNotFound,
  type ReminderLog,
  type Service,
  type Slot,
  type SlotQuery,
  type Specialist,
  type SpecialistDetails,
  SpecialistId,
  SpecialistNotFound,
  type StageId,
  type TimeTaken,
  TimeUnavailable,
  weekdayOf
} from "@scope-bot/domain"
import { Clock, Context, Effect, Layer, Option } from "effect"
import { eventOf } from "./Activities.ts"
import { nowIso } from "./Agents.ts"
import { Deals } from "./Deals.ts"

const SLOT_STEP_MINUTES = 30
const DEFAULT_MINUTES = 30

/** How a booking is made. AI employees keep to every rule; a person may book outside the specialist's hours. */
export interface BookingOptions {
  readonly bookedBy: BookedBy
  /** `held` for a time offered in a chat, `pending` when the employee must ask first. */
  readonly status?: Extract<AppointmentStatus, "held" | "pending" | "booked">
}

type BookError =
  | CalendarOff
  | SpecialistNotFound
  | ContactNotFound
  | DealNotFound
  | ReferenceNotFound
  | TimeTaken
  | TimeUnavailable

/** The calendar of a business. People and AI employees book through it, so the same rules hold for both. */
export class Calendar extends Context.Service<
  Calendar,
  {
    readonly settings: Effect.Effect<CalendarSettings>
    saveSettings(
      settings: CalendarSettings
    ): Effect.Effect<CalendarSettings, TimeUnavailable | DealStageNotFound | AgentNotFound>
    readonly specialists: Effect.Effect<ReadonlyArray<Specialist>>
    createSpecialist(details: SpecialistDetails): Effect.Effect<Specialist, ReferenceNotFound>
    updateSpecialist(
      id: SpecialistId,
      details: SpecialistDetails
    ): Effect.Effect<Specialist, SpecialistNotFound | ReferenceNotFound>
    removeSpecialist(id: SpecialistId): Effect.Effect<void, SpecialistNotFound>
    appointments(range: {
      readonly from: string
      readonly to: string
    }): Effect.Effect<ReadonlyArray<Appointment>, CalendarOff>
    appointmentsFor(links: {
      readonly contactId?: Appointment["contactId"]
      readonly dealId?: DealId
    }): Effect.Effect<ReadonlyArray<Appointment>>
    slots(query: SlotQuery): Effect.Effect<ReadonlyArray<Slot>, CalendarOff>
    book(input: NewAppointment, options: BookingOptions): Effect.Effect<Appointment, BookError>
    move(
      id: AppointmentId,
      to: MoveAppointment,
      options: BookingOptions
    ): Effect.Effect<Appointment, BookError | AppointmentNotFound | AppointmentClosed>
    record(
      id: AppointmentId,
      outcome: AppointmentOutcome
    ): Effect.Effect<Appointment, AppointmentNotFound | AppointmentClosed>
    cancel(id: AppointmentId, reason: string): Effect.Effect<Appointment, AppointmentNotFound | AppointmentClosed>
    /** A person agrees to what an AI employee asked to book. */
    approve(id: AppointmentId): Effect.Effect<Appointment, AppointmentNotFound | AppointmentClosed | TimeTaken>
    find(id: AppointmentId): Effect.Effect<Appointment, AppointmentNotFound>
    /** Lets a held time go at once, as if its hold ran out. It leaves no trace, like a hold that runs out. */
    releaseHold(id: AppointmentId): Effect.Effect<void>
    /** What happened to the reminders of an appointment. */
    reminders(id: AppointmentId): Effect.Effect<ReadonlyArray<ReminderLog>, AppointmentNotFound>
    /** Turns a time held in a chat into a booking, when the client said yes. */
    confirmHold(
      id: AppointmentId,
      status: Extract<AppointmentStatus, "pending" | "booked">
    ): Effect.Effect<Appointment, AppointmentNotFound | AppointmentClosed | TimeTaken>
  }
>()("@scope-bot/agents/Calendar") {
  static readonly layer = Layer.effect(
    Calendar,
    Effect.gen(function* () {
      const storage = yield* CalendarStorage
      const store = yield* Store
      const deals = yield* Deals

      const now = Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis)))

      const enabledSettings = storage.settings.pipe(
        Effect.flatMap((settings) => (settings.enabled ? Effect.succeed(settings) : Effect.fail(new CalendarOff())))
      )

      const getAppointment = (id: AppointmentId) =>
        storage
          .findAppointment(id)
          .pipe(
            Effect.flatMap(
              Option.match({ onNone: () => Effect.fail(new AppointmentNotFound()), onSome: Effect.succeed })
            )
          )

      const getSpecialist = (id: SpecialistId) =>
        storage
          .findSpecialist(id)
          .pipe(
            Effect.flatMap(
              Option.match({ onNone: () => Effect.fail(new SpecialistNotFound()), onSome: Effect.succeed })
            )
          )

      const checkServices = Effect.fn("Calendar.checkServices")(function* (details: SpecialistDetails) {
        const services = yield* store.services
        if (!details.serviceIds.every((id) => services.some((service) => service.id === id))) {
          return yield* Effect.fail(new ReferenceNotFound())
        }
      })

      const serviceOf = (id: Service["id"] | null) =>
        id === null ? Effect.succeed(null) : store.findService(id).pipe(Effect.map(Option.getOrNull))

      /** Why the specialist does not work at this time, or null when they do. */
      const offHours = (specialist: Specialist, timeZone: string, start: Date, minutes: number): string | null => {
        const day = dayOf(start, timeZone)
        if (specialist.timeOff.some((off) => off.from <= day && day <= off.to)) {
          return `${specialist.name} is off that day`
        }
        const hours = specialist.hours[weekdayOf(day)]
        if (hours === undefined || !hours.open) return `${specialist.name} does not work that day`
        const clock = Math.round((start.getTime() - atZoned(day, 0, timeZone).getTime()) / 60000)
        const end = clock + minutes
        if (clock < minutesOf(hours.from) || end > minutesOf(hours.to)) return "It is outside the working hours"
        const onBreak = hours.breaks.some((item) => clock < minutesOf(item.to) && minutesOf(item.from) < end)
        return onBreak ? "It is during a break" : null
      }

      /** Why this time cannot be booked with this specialist, or null when it can. */
      const unavailable = (
        specialist: Specialist,
        settings: CalendarSettings,
        start: Date,
        minutes: number,
        at: Date
      ): string | null => {
        if (!specialist.active) return `${specialist.name} takes no appointments`
        const hours = offHours(specialist, settings.timeZone, start, minutes)
        if (hours !== null) return hours
        if (start.getTime() < at.getTime() + settings.minNoticeMinutes * 60000) return "It is too soon"
        if (start.getTime() > at.getTime() + settings.maxDaysAhead * 24 * 3600000) return "It is too far ahead"
        return null
      }

      const lengthOf = (service: Service | null, minutes: number | null) =>
        minutes ?? service?.minutes ?? DEFAULT_MINUTES

      /** Moves a deal to the stage a rule names, if the deal is still open and not there yet. */
      const applyRule = Effect.fn("Calendar.applyRule")(function* (dealId: DealId | null, stageId: StageId | null) {
        if (dealId === null || stageId === null) return
        const deal = yield* store.findDeal(dealId)
        if (Option.isNone(deal) || deal.value.stageId === stageId || deal.value.closedAt !== null) return
        const { id: _id, createdAt: _created, stageChangedAt: _changed, closedAt: _closed, ...details } = deal.value
        const pipeline = (yield* deals.pipelines).find((item) => item.stages.some((stage) => stage.id === stageId))
        if (pipeline === undefined) return
        yield* deals.update(dealId, { ...details, pipelineId: pipeline.id, stageId }).pipe(Effect.ignore)
      })

      /** A booking for a contact without a deal starts one, when the rules name a stage for bookings. */
      const dealFor = Effect.fn("Calendar.dealFor")(function* (
        input: NewAppointment,
        service: Service | null,
        settings: CalendarSettings,
        ownerId: BookedBy["agentId"]
      ) {
        if (input.dealId !== null) {
          if (Option.isNone(yield* store.findDeal(input.dealId))) return yield* Effect.fail(new DealNotFound())
          return input.dealId
        }
        const stageId = settings.stageRules.booked
        if (input.contactId === null || stageId === null) return null
        const contact = yield* store.findContact(input.contactId)
        const pipeline = (yield* deals.pipelines).find((item) => item.stages.some((stage) => stage.id === stageId))
        if (Option.isNone(contact) || pipeline === undefined) return null
        const deal: Deal = yield* deals
          .create({
            title: `${service?.name ?? "Appointment"} · ${contact.value.name}`,
            contactId: input.contactId,
            pipelineId: pipeline.id,
            stageId,
            amount: service?.price ?? 0,
            source: "",
            ownerId,
            nextStep: "",
            nextStepAt: null,
            closeDate: null,
            probability: null,
            lostReason: "",
            serviceIds: service === null ? [] : [service.id]
          })
          .pipe(Effect.orDie)
        return deal.id
      })

      const logEvent = (appointment: Appointment, text: string) =>
        nowIso.pipe(
          Effect.flatMap((at) =>
            store.saveActivity(
              eventOf(
                text,
                { contactId: appointment.contactId, dealId: appointment.dealId, agentId: appointment.bookedBy.agentId },
                at
              )
            )
          )
        )

      const isOpen = (appointment: Appointment) =>
        ["held", "pending", "booked", "confirmed"].includes(appointment.status)

      const describe = Effect.fn("Calendar.describe")(function* (appointment: Appointment) {
        const settings = yield* storage.settings
        const service = yield* serviceOf(appointment.serviceId)
        const specialist = yield* storage.findSpecialist(appointment.specialistId)
        const name = Option.match(specialist, { onNone: () => "", onSome: (item) => ` with ${item.name}` })
        return `${service?.name ?? "Appointment"} on ${describeTime(appointment.startsAt, settings.timeZone)}${name}`
      })

      const slots = Effect.fn("Calendar.slots")(function* (query: SlotQuery) {
        const settings = yield* enabledSettings
        const at = yield* now
        const service = yield* serviceOf(query.serviceId)
        const minutes = lengthOf(service, query.minutes)
        const specialists = (yield* storage.specialists).filter(
          (item) =>
            (query.specialistId === null || item.id === query.specialistId) &&
            (query.serviceId === null || item.serviceIds.includes(query.serviceId))
        )
        const dayStart = atZoned(query.day, 0, settings.timeZone)
        const dayEnd = addMinutes(dayStart, 24 * 60)
        const booked = (yield* storage.appointments({ from: dayStart.toISOString(), to: dayEnd.toISOString() })).filter(
          (item) => isBusy(item, at)
        )
        const gap = settings.bufferMinutes * 60000
        return specialists.flatMap((specialist) => {
          const hours = specialist.hours[weekdayOf(query.day)]
          if (hours === undefined || !hours.open) return []
          const free: Array<Slot> = []
          for (let clock = minutesOf(hours.from); clock + minutes <= minutesOf(hours.to); clock += SLOT_STEP_MINUTES) {
            const start = atZoned(query.day, clock, settings.timeZone)
            if (unavailable(specialist, settings, start, minutes, at) !== null) continue
            const end = addMinutes(start, minutes)
            const clash = booked.some(
              (item) =>
                item.specialistId === specialist.id &&
                Date.parse(item.startsAt) < end.getTime() + gap &&
                start.getTime() < Date.parse(item.endsAt) + gap
            )
            if (!clash)
              free.push({ specialistId: specialist.id, startsAt: start.toISOString(), endsAt: end.toISOString() })
          }
          return free
        })
      })

      /** Checks the time and takes it in one step. */
      const takeTime = Effect.fn("Calendar.takeTime")(function* (
        appointment: Appointment,
        specialist: Specialist,
        settings: CalendarSettings,
        strict: boolean
      ) {
        const at = yield* now
        const start = new Date(appointment.startsAt)
        if (Number.isNaN(start.getTime())) return yield* Effect.fail(new TimeUnavailable({ reason: "Unknown time" }))
        const minutes = Math.round((Date.parse(appointment.endsAt) - start.getTime()) / 60000)
        if (appointment.serviceId !== null && !specialist.serviceIds.includes(appointment.serviceId)) {
          return yield* Effect.fail(new TimeUnavailable({ reason: `${specialist.name} does not do this service` }))
        }
        const reason = unavailable(specialist, settings, start, minutes, at)
        // A person may book outside the hours, for example a client who walks in. AI employees may not.
        if (reason !== null && (strict || !specialist.active))
          return yield* Effect.fail(new TimeUnavailable({ reason }))
        yield* storage.take(appointment, settings.bufferMinutes, at)
      })

      /** The service, and the start time, of a booking whose links all exist. */
      const checkBooking = Effect.fn("Calendar.checkBooking")(function* (input: NewAppointment) {
        const service = yield* serviceOf(input.serviceId)
        if (input.serviceId !== null && service === null) return yield* Effect.fail(new ReferenceNotFound())
        if (input.contactId !== null && Option.isNone(yield* store.findContact(input.contactId))) {
          return yield* Effect.fail(new ContactNotFound())
        }
        const start = new Date(input.startsAt)
        if (Number.isNaN(start.getTime())) return yield* Effect.fail(new TimeUnavailable({ reason: "Unknown time" }))
        return { service, start }
      })

      const book = Effect.fn("Calendar.book")(function* (input: NewAppointment, options: BookingOptions) {
        const settings = yield* enabledSettings
        const specialist = yield* getSpecialist(input.specialistId)
        const { service, start } = yield* checkBooking(input)
        const status = options.status ?? "booked"
        const createdAt = yield* nowIso
        const draft: Appointment = {
          id: AppointmentId.make(crypto.randomUUID()),
          specialistId: specialist.id,
          serviceId: input.serviceId,
          contactId: input.contactId,
          dealId: input.dealId,
          startsAt: start.toISOString(),
          endsAt: addMinutes(start, lengthOf(service, input.minutes)).toISOString(),
          status,
          holdExpiresAt: status === "held" ? addMinutes(yield* now, settings.holdMinutes).toISOString() : null,
          bookedBy: options.bookedBy,
          note: input.note,
          cancelReason: "",
          createdAt,
          updatedAt: createdAt
        }
        yield* takeTime(draft, specialist, settings, options.bookedBy.agentId !== null)
        // A held time is only a promise, so it starts no deal and moves nothing yet.
        if (status === "held") return draft
        const appointment = { ...draft, dealId: yield* dealFor(input, service, settings, options.bookedBy.agentId) }
        yield* storage.saveAppointment(appointment)
        yield* logEvent(
          appointment,
          `${status === "pending" ? "Asked to book" : "Booked"} ${yield* describe(appointment)}`
        )
        if (status === "booked") yield* applyRule(appointment.dealId, settings.stageRules.booked)
        return appointment
      })

      const getOpen = Effect.fn("Calendar.getOpen")(function* (id: AppointmentId) {
        const appointment = yield* getAppointment(id)
        if (!isOpen(appointment)) return yield* Effect.fail(new AppointmentClosed())
        return appointment
      })

      /** Takes a held or pending time again as booked, so an expired hold cannot be double booked. */
      const promote = Effect.fn("Calendar.promote")(function* (
        appointment: Appointment,
        status: Extract<AppointmentStatus, "pending" | "booked">
      ) {
        const settings = yield* storage.settings
        const service = yield* serviceOf(appointment.serviceId)
        const updatedAt = yield* nowIso
        const promoted: Appointment = { ...appointment, status, holdExpiresAt: null, updatedAt }
        yield* storage.take(promoted, settings.bufferMinutes, yield* now)
        const dealId =
          promoted.dealId ??
          (yield* dealFor(
            { ...promoted, minutes: null, note: promoted.note },
            service,
            settings,
            promoted.bookedBy.agentId
          ).pipe(Effect.orElseSucceed(() => null)))
        const saved = { ...promoted, dealId }
        yield* storage.saveAppointment(saved)
        yield* logEvent(saved, `${status === "pending" ? "Asked to book" : "Booked"} ${yield* describe(saved)}`)
        if (status === "booked") yield* applyRule(saved.dealId, settings.stageRules.booked)
        return saved
      })

      return Calendar.of({
        settings: storage.settings,
        saveSettings: Effect.fn("Calendar.saveSettings")(function* (settings) {
          if (!isTimeZone(settings.timeZone))
            return yield* Effect.fail(new TimeUnavailable({ reason: "Unknown time zone" }))
          const stages = (yield* deals.pipelines).flatMap((pipeline) => pipeline.stages.map((stage) => stage.id))
          const rules = Object.values(settings.stageRules).filter((stage) => stage !== null)
          if (!rules.every((stage) => stages.includes(stage))) return yield* Effect.fail(new DealStageNotFound())
          if (settings.assistantId !== null && Option.isNone(yield* store.findAgent(settings.assistantId))) {
            return yield* Effect.fail(new AgentNotFound())
          }
          yield* storage.saveSettings(settings)
          return settings
        }),
        specialists: storage.specialists,
        createSpecialist: Effect.fn("Calendar.createSpecialist")(function* (details) {
          yield* checkServices(details)
          const specialist: Specialist = {
            ...details,
            id: SpecialistId.make(crypto.randomUUID()),
            createdAt: yield* nowIso
          }
          yield* storage.saveSpecialist(specialist)
          return specialist
        }),
        updateSpecialist: Effect.fn("Calendar.updateSpecialist")(function* (id, details) {
          const existing = yield* getSpecialist(id)
          yield* checkServices(details)
          const updated: Specialist = { ...existing, ...details }
          yield* storage.saveSpecialist(updated)
          return updated
        }),
        removeSpecialist: Effect.fn("Calendar.removeSpecialist")(function* (id) {
          yield* getSpecialist(id)
          yield* storage.removeSpecialist(id)
        }),
        appointments: (range) => enabledSettings.pipe(Effect.andThen(storage.appointments(range))),
        appointmentsFor: (links) =>
          storage.appointments({
            ...(links.contactId === undefined || links.contactId === null ? {} : { contactId: links.contactId }),
            ...(links.dealId === undefined ? {} : { dealId: links.dealId })
          }),
        slots,
        book,
        move: Effect.fn("Calendar.move")(function* (id, to, options) {
          const settings = yield* enabledSettings
          const appointment = yield* getOpen(id)
          const specialist = yield* getSpecialist(to.specialistId)
          const start = new Date(to.startsAt)
          if (Number.isNaN(start.getTime())) return yield* Effect.fail(new TimeUnavailable({ reason: "Unknown time" }))
          const length = Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)
          const moved: Appointment = {
            ...appointment,
            specialistId: specialist.id,
            startsAt: start.toISOString(),
            endsAt: new Date(start.getTime() + length).toISOString(),
            // A confirmed time is no longer confirmed once it changes.
            status: appointment.status === "confirmed" ? "booked" : appointment.status,
            updatedAt: yield* nowIso
          }
          yield* takeTime(moved, specialist, settings, options.bookedBy.agentId !== null)
          yield* logEvent(moved, `Moved to ${yield* describe(moved)}`)
          return moved
        }),
        record: Effect.fn("Calendar.record")(function* (id, outcome) {
          const appointment = yield* getAppointment(id)
          const allowed =
            outcome === "confirmed" ? ["booked", "confirmed"] : ["booked", "confirmed", "arrived", "no-show"]
          if (!allowed.includes(appointment.status)) return yield* Effect.fail(new AppointmentClosed())
          const updated: Appointment = { ...appointment, status: outcome, updatedAt: yield* nowIso }
          yield* storage.saveAppointment(updated)
          const settings = yield* storage.settings
          const what = { confirmed: "Confirmed", arrived: "Came to", "no-show": "Did not come to" }[outcome]
          yield* logEvent(updated, `${what} ${yield* describe(updated)}`)
          if (outcome === "arrived") yield* applyRule(updated.dealId, settings.stageRules.arrived)
          if (outcome === "no-show") yield* applyRule(updated.dealId, settings.stageRules.noShow)
          return updated
        }),
        cancel: Effect.fn("Calendar.cancel")(function* (id, reason) {
          const appointment = yield* getOpen(id)
          const updated: Appointment = {
            ...appointment,
            status: "cancelled",
            cancelReason: reason,
            holdExpiresAt: null,
            updatedAt: yield* nowIso
          }
          yield* storage.saveAppointment(updated)
          // A hold that nobody took leaves no trace in the history.
          if (appointment.status !== "held") {
            yield* logEvent(updated, `Cancelled ${yield* describe(updated)}${reason === "" ? "" : `: ${reason}`}`)
          }
          // A hold was never a booking, so letting it go moves no deal.
          if (updated.dealId !== null && appointment.status !== "held") {
            const others = yield* storage.appointments({ dealId: updated.dealId })
            if (others.every((item) => item.status === "cancelled")) {
              yield* applyRule(updated.dealId, (yield* storage.settings).stageRules.allCancelled)
            }
          }
          return updated
        }),
        approve: Effect.fn("Calendar.approve")(function* (id) {
          const appointment = yield* getAppointment(id)
          if (appointment.status !== "pending") return yield* Effect.fail(new AppointmentClosed())
          return yield* promote(appointment, "booked")
        }),
        find: getAppointment,
        releaseHold: Effect.fn("Calendar.releaseHold")(function* (id) {
          const found = yield* storage.findAppointment(id)
          if (Option.isNone(found) || found.value.status !== "held") return
          const at = yield* nowIso
          yield* storage.saveAppointment({ ...found.value, holdExpiresAt: at, updatedAt: at })
        }),
        reminders: (id) => getAppointment(id).pipe(Effect.andThen(storage.reminders([id]))),
        confirmHold: Effect.fn("Calendar.confirmHold")(function* (id, status) {
          const appointment = yield* getAppointment(id)
          if (appointment.status !== "held") return yield* Effect.fail(new AppointmentClosed())
          return yield* promote(appointment, status)
        })
      })
    })
  )
}
