import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { UserId } from "./Auth.ts"
import { Day } from "./Business.ts"
import { Channel } from "./Channel.ts"
import { ContactId } from "./Contact.ts"
import { DealId, StageId } from "./Deal.ts"
import { ServiceId } from "./Service.ts"

export const SpecialistId = Schema.String.pipe(Schema.brand("SpecialistId"))
export type SpecialistId = typeof SpecialistId.Type

export const AppointmentId = Schema.String.pipe(Schema.brand("AppointmentId"))
export type AppointmentId = typeof AppointmentId.Type

/** A clock time like 09:30, in the calendar's time zone. */
export const ClockTime = Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/))
export type ClockTime = typeof ClockTime.Type

export const TimeRange = Schema.Struct({ from: ClockTime, to: ClockTime })
export type TimeRange = typeof TimeRange.Type

/** One weekday. A closed day takes no appointments. */
export const DayHours = Schema.Struct({
  open: Schema.Boolean,
  from: ClockTime,
  to: ClockTime,
  breaks: Schema.Array(TimeRange)
})
export type DayHours = typeof DayHours.Type

/** Monday first, seven days. */
export const WeekHours = Schema.Array(DayHours).check(Schema.isBetweenLength(7, 7))
export type WeekHours = typeof WeekHours.Type

/** Days a specialist does not work, both ends included. */
export const TimeOff = Schema.Struct({
  from: Day,
  to: Day,
  note: Schema.String
})
export type TimeOff = typeof TimeOff.Type

/** What can change about someone who takes appointments. */
export const SpecialistDetails = Schema.Struct({
  name: Schema.NonEmptyString,
  /** The job in the business's own words, like Dentist or Barber. */
  title: Schema.String,
  color: Schema.String,
  /** The person on the team who signs in as this specialist, if any. They see only their own calendar. */
  userId: Schema.NullOr(UserId),
  /** Off means the calendar keeps them but offers no times. */
  active: Schema.Boolean,
  hours: WeekHours,
  /** Only these can be booked with them. */
  serviceIds: Schema.Array(ServiceId),
  timeOff: Schema.Array(TimeOff)
})
export type SpecialistDetails = typeof SpecialistDetails.Type

/** Someone, or something like a room, that appointments are booked with. */
export const Specialist = Schema.Struct({
  id: SpecialistId,
  ...SpecialistDetails.fields,
  createdAt: Schema.String
})
export type Specialist = typeof Specialist.Type

const workday: DayHours = { open: true, from: "09:00", to: "18:00", breaks: [] }

export const defaultWeekHours: WeekHours = [
  workday,
  workday,
  workday,
  workday,
  workday,
  { open: false, from: "09:00", to: "18:00", breaks: [] },
  { open: false, from: "09:00", to: "18:00", breaks: [] }
]

/**
 * Where an appointment is.
 * - `held`: an AI employee offered the time in a chat, and it is kept for a short while.
 * - `pending`: booked by an AI employee that has to ask first. The time is kept until a person decides.
 * - `booked`, `confirmed`: on the calendar; confirmed means the client said they come.
 * - `arrived`, `no-show`: what happened.
 * - `cancelled`: the time is free again.
 */
export const AppointmentStatus = Schema.Literals([
  "held",
  "pending",
  "booked",
  "confirmed",
  "arrived",
  "no-show",
  "cancelled"
])
export type AppointmentStatus = typeof AppointmentStatus.Type

/** Statuses that keep the time taken. */
export const busyStatuses: ReadonlyArray<AppointmentStatus> = ["held", "pending", "booked", "confirmed", "arrived"]

/** Who put it on the calendar. */
export const BookedBy = Schema.Struct({
  /** Empty means a person did. */
  agentId: Schema.NullOr(AgentId),
  channel: Schema.NullOr(Channel)
})
export type BookedBy = typeof BookedBy.Type

export const Appointment = Schema.Struct({
  id: AppointmentId,
  specialistId: SpecialistId,
  serviceId: Schema.NullOr(ServiceId),
  contactId: Schema.NullOr(ContactId),
  dealId: Schema.NullOr(DealId),
  /** ISO times. */
  startsAt: Schema.String,
  endsAt: Schema.String,
  status: AppointmentStatus,
  /** When a held time is let go. */
  holdExpiresAt: Schema.NullOr(Schema.String),
  bookedBy: BookedBy,
  note: Schema.String,
  cancelReason: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String
})
export type Appointment = typeof Appointment.Type

export const NewAppointment = Schema.Struct({
  specialistId: SpecialistId,
  serviceId: Schema.NullOr(ServiceId),
  contactId: Schema.NullOr(ContactId),
  /** Empty makes a new deal when the calendar's rules say booking starts one. */
  dealId: Schema.NullOr(DealId),
  startsAt: Schema.String,
  /** Empty takes the length of the service. */
  minutes: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 24 * 60 }))),
  note: Schema.String
})
export type NewAppointment = typeof NewAppointment.Type

export const MoveAppointment = Schema.Struct({
  specialistId: SpecialistId,
  startsAt: Schema.String
})
export type MoveAppointment = typeof MoveAppointment.Type

/** What a person records about an appointment. */
export const AppointmentOutcome = Schema.Literals(["confirmed", "arrived", "no-show"])
export type AppointmentOutcome = typeof AppointmentOutcome.Type

export const CancelAppointment = Schema.Struct({ reason: Schema.String })
export type CancelAppointment = typeof CancelAppointment.Type

/** Which stage a deal goes to when something happens to its appointments. Empty leaves the deal where it is. */
export const StageRules = Schema.Struct({
  booked: Schema.NullOr(StageId),
  arrived: Schema.NullOr(StageId),
  noShow: Schema.NullOr(StageId),
  allCancelled: Schema.NullOr(StageId)
})
export type StageRules = typeof StageRules.Type

export const Reminder = Schema.Struct({
  /** Minutes before the start. */
  minutesBefore: Schema.Int.check(Schema.isBetween({ minimum: 10, maximum: 7 * 24 * 60 })),
  enabled: Schema.Boolean,
  /** {name}, {service}, {specialist}, {date}, {time} and {address} are filled in. */
  text: Schema.String
})
export type Reminder = typeof Reminder.Type

/** The calendar of a business. It is off until the business turns it on. */
export const CalendarSettings = Schema.Struct({
  enabled: Schema.Boolean,
  timeZone: Schema.String,
  /** Nobody gets a time that starts sooner than this. */
  minNoticeMinutes: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 7 * 24 * 60 })),
  maxDaysAhead: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 365 })),
  /** Kept free after each appointment. */
  bufferMinutes: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 120 })),
  /** How long a time offered in a chat is kept. */
  holdMinutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 120 })),
  /** Clients may move or cancel on their own until this many hours before. */
  clientChangeHours: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 14 * 24 })),
  stageRules: StageRules,
  reminders: Schema.Array(Reminder),
  /**
   * What a client is told when a person moves or cancels their appointment from a
   * chat with an employee. The same fields as reminders are filled in.
   */
  notices: Schema.Struct({ moved: Schema.String, cancelled: Schema.String }),
  /** The employee the team asks about the schedule. Empty hides the question box on a specialist's day. */
  assistantId: Schema.NullOr(AgentId)
})
export type CalendarSettings = typeof CalendarSettings.Type

export const defaultCalendarSettings: CalendarSettings = {
  enabled: false,
  timeZone: "Asia/Tbilisi",
  minNoticeMinutes: 120,
  maxDaysAhead: 60,
  bufferMinutes: 0,
  holdMinutes: 15,
  clientChangeHours: 24,
  stageRules: { booked: null, arrived: null, noShow: null, allCancelled: null },
  reminders: [
    {
      minutesBefore: 24 * 60,
      enabled: true,
      text: "Hi {name}! A reminder: {service} with {specialist} on {date} at {time}. Reply 1 to confirm or 2 to move it."
    },
    { minutesBefore: 120, enabled: true, text: "See you at {time}, {address}." }
  ],
  notices: {
    moved: "Hi {name}! Your appointment for {service} with {specialist} has moved to {date} at {time}.",
    cancelled: "Hi {name}! Your appointment for {service} with {specialist} on {date} at {time} is cancelled."
  },
  assistantId: null
}

/** A free start time. */
/**
 * What happened to one reminder of an appointment. Kept per start time, so a
 * moved appointment is reminded again of its new time.
 */
export const ReminderLog = Schema.Struct({
  appointmentId: AppointmentId,
  startsAt: Schema.String,
  minutesBefore: Schema.Int,
  outcome: Schema.Literals(["sent", "skipped", "failed"]),
  /** Why it was skipped or failed. Empty when sent. */
  reason: Schema.String,
  at: Schema.String
})
export type ReminderLog = typeof ReminderLog.Type

export const Slot = Schema.Struct({
  specialistId: SpecialistId,
  startsAt: Schema.String,
  endsAt: Schema.String
})
export type Slot = typeof Slot.Type

export const SlotQuery = Schema.Struct({
  serviceId: Schema.NullOr(ServiceId),
  /** Empty asks every specialist who does the service. */
  specialistId: Schema.NullOr(SpecialistId),
  day: Day,
  /** Empty takes the length of the service. */
  minutes: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 24 * 60 })))
})
export type SlotQuery = typeof SlotQuery.Type

export class CalendarOff extends Schema.TaggedError<CalendarOff>()("CalendarOff", {}, { httpApiStatus: 409 }) {}

export class SpecialistNotFound extends Schema.TaggedError<SpecialistNotFound>()(
  "SpecialistNotFound",
  {},
  { httpApiStatus: 404 }
) {}

export class AppointmentNotFound extends Schema.TaggedError<AppointmentNotFound>()(
  "AppointmentNotFound",
  {},
  { httpApiStatus: 404 }
) {}

/** Someone else has this time, or it overlaps an appointment. */
export class TimeTaken extends Schema.TaggedError<TimeTaken>()("TimeTaken", {}, { httpApiStatus: 409 }) {}

/** Outside the specialist's hours, on a day off, too soon or too far ahead, or a service they do not do. */
export class TimeUnavailable extends Schema.TaggedError<TimeUnavailable>()(
  "TimeUnavailable",
  { reason: Schema.String },
  { httpApiStatus: 422 }
) {}

/** The appointment is already over or cancelled, so it cannot change that way. */
export class AppointmentClosed extends Schema.TaggedError<AppointmentClosed>()(
  "AppointmentClosed",
  {},
  { httpApiStatus: 409 }
) {}
