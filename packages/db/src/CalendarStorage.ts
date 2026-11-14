import {
  Appointment,
  type AppointmentId,
  type BusinessId,
  busyStatuses,
  CalendarSettings,
  type ContactId,
  type DealId,
  defaultCalendarSettings,
  ReminderLog,
  Specialist,
  type SpecialistId,
  TimeTaken
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect"
import { SqlClient } from "effect/sql"
import { CurrentBusiness, requireBusiness } from "./CurrentBusiness.ts"

const MINUTE_MS = 60 * 1000

/** Which appointments to list. Each given field narrows the list. */
export interface AppointmentFilter {
  /** Appointments that overlap this time, ISO. */
  readonly from?: string
  readonly to?: string
  readonly specialistId?: SpecialistId
  readonly contactId?: ContactId
  readonly dealId?: DealId
}

/** Whether an appointment keeps its time taken at this moment. A held time stops once its hold runs out. */
export const isBusy = (appointment: Appointment, now: Date) =>
  busyStatuses.includes(appointment.status) &&
  !(
    appointment.status === "held" &&
    appointment.holdExpiresAt !== null &&
    Date.parse(appointment.holdExpiresAt) <= now.getTime()
  )

/** Two times clash when they overlap, counting the gap kept after each one. */
const clashes = (a: Appointment, b: Appointment, bufferMinutes: number) => {
  const gap = bufferMinutes * MINUTE_MS
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) + gap && Date.parse(b.startsAt) < Date.parse(a.endsAt) + gap
}

const matches = (appointment: Appointment, filter: AppointmentFilter) =>
  (filter.from === undefined || Date.parse(appointment.endsAt) > Date.parse(filter.from)) &&
  (filter.to === undefined || Date.parse(appointment.startsAt) < Date.parse(filter.to)) &&
  (filter.specialistId === undefined || appointment.specialistId === filter.specialistId) &&
  (filter.contactId === undefined || appointment.contactId === filter.contactId) &&
  (filter.dealId === undefined || appointment.dealId === filter.dealId)

const byStart = (a: Appointment, b: Appointment) => Date.parse(a.startsAt) - Date.parse(b.startsAt)

const reminderKey = (log: ReminderLog) => `${log.appointmentId}|${Date.parse(log.startsAt)}|${log.minutesBefore}`

/** The calendar of each business: its settings, who takes appointments, and the appointments. */
export class CalendarStorage extends Context.Service<
  CalendarStorage,
  {
    readonly settings: Effect.Effect<CalendarSettings>
    saveSettings(settings: CalendarSettings): Effect.Effect<void>
    readonly specialists: Effect.Effect<ReadonlyArray<Specialist>>
    findSpecialist(id: SpecialistId): Effect.Effect<Option.Option<Specialist>>
    saveSpecialist(specialist: Specialist): Effect.Effect<void>
    /** Also removes their appointments. */
    removeSpecialist(id: SpecialistId): Effect.Effect<void>
    appointments(filter: AppointmentFilter): Effect.Effect<ReadonlyArray<Appointment>>
    findAppointment(id: AppointmentId): Effect.Effect<Option.Option<Appointment>>
    /**
     * Saves an appointment that takes its time, unless another busy appointment of the same specialist
     * clashes with it. The check and the write happen together, so two bookings can never get the same time.
     */
    take(appointment: Appointment, bufferMinutes: number, now: Date): Effect.Effect<void, TimeTaken>
    /** Saves a change that frees the time or keeps it as it was. */
    saveAppointment(appointment: Appointment): Effect.Effect<void>
    /** What happened to the reminders of these appointments. */
    reminders(appointmentIds: ReadonlyArray<AppointmentId>): Effect.Effect<ReadonlyArray<ReminderLog>>
    /**
     * Keeps a reminder as sent before it goes out, so it can never go twice.
     * False when it was already taken care of.
     */
    claimReminder(log: ReminderLog): Effect.Effect<boolean>
    /** Changes what happened to a reminder after it was claimed. */
    saveReminder(log: ReminderLog): Effect.Effect<void>
    /** Businesses with the calendar on, for background work like reminders. */
    readonly enabledBusinesses: Effect.Effect<ReadonlyArray<BusinessId>>
  }
>()("@scope-bot/db/CalendarStorage") {
  static readonly layerMemory = Layer.sync(CalendarStorage, () => {
    interface Calendar {
      settings: CalendarSettings
      specialists: Array<Specialist>
      appointments: Map<AppointmentId, Appointment>
      reminders: Map<string, ReminderLog>
    }
    const calendars = new Map<BusinessId | null, Calendar>()
    const lock = Semaphore.makeUnsafe(1)

    const calendar = CurrentBusiness.pipe(
      Effect.map((business) => {
        const existing = calendars.get(business)
        if (existing !== undefined) return existing
        const created: Calendar = {
          settings: defaultCalendarSettings,
          specialists: [],
          appointments: new Map(),
          reminders: new Map()
        }
        calendars.set(business, created)
        return created
      })
    )
    const use = <A>(f: (calendar: Calendar) => A) => calendar.pipe(Effect.map(f))

    return CalendarStorage.of({
      settings: use((item) => item.settings),
      saveSettings: (settings) =>
        use((item) => {
          item.settings = settings
        }),
      specialists: use((item) => [...item.specialists]),
      findSpecialist: (id) => use((item) => Option.fromNullishOr(item.specialists.find((one) => one.id === id))),
      saveSpecialist: (specialist) =>
        use((item) => {
          const index = item.specialists.findIndex((one) => one.id === specialist.id)
          if (index === -1) item.specialists.push(specialist)
          else item.specialists[index] = specialist
        }),
      removeSpecialist: (id) =>
        use((item) => {
          item.specialists = item.specialists.filter((one) => one.id !== id)
          for (const [key, appointment] of item.appointments) {
            if (appointment.specialistId === id) item.appointments.delete(key)
          }
        }),
      appointments: (filter) =>
        use((item) => [...item.appointments.values()].filter((one) => matches(one, filter)).sort(byStart)),
      findAppointment: (id) => use((item) => Option.fromNullishOr(item.appointments.get(id))),
      take: (appointment, bufferMinutes, now) =>
        lock.withPermits(1)(
          calendar.pipe(
            Effect.flatMap((item) => {
              const clash = [...item.appointments.values()].some(
                (other) =>
                  other.id !== appointment.id &&
                  other.specialistId === appointment.specialistId &&
                  isBusy(other, now) &&
                  clashes(other, appointment, bufferMinutes)
              )
              if (clash) return Effect.fail(new TimeTaken())
              item.appointments.set(appointment.id, appointment)
              return Effect.void
            })
          )
        ),
      saveAppointment: (appointment) =>
        use((item) => {
          item.appointments.set(appointment.id, appointment)
        }),
      reminders: (ids) => use((item) => [...item.reminders.values()].filter((log) => ids.includes(log.appointmentId))),
      claimReminder: (log) =>
        use((item) => {
          const key = reminderKey(log)
          if (item.reminders.has(key)) return false
          item.reminders.set(key, log)
          return true
        }),
      saveReminder: (log) =>
        use((item) => {
          item.reminders.set(reminderKey(log), log)
        }),
      enabledBusinesses: Effect.sync(() =>
        [...calendars].flatMap(([business, item]) => (business !== null && item.settings.enabled ? [business] : []))
      )
    })
  })

  static readonly layerPostgres = Layer.effect(
    CalendarStorage,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const decodeSettings = Schema.decodeUnknownEffect(CalendarSettings)
      const decodeSpecialists = Schema.decodeUnknownEffect(Schema.Array(Specialist))
      const decodeAppointments = Schema.decodeUnknownEffect(Schema.Array(Appointment))
      const decodeReminders = Schema.decodeUnknownEffect(Schema.Array(ReminderLog))
      const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value)

      const toSpecialist = ({ businessId: _business, seq: _seq, ...row }: Record<string, unknown>) => ({
        ...row,
        createdAt: iso(row.createdAt)
      })
      const toAppointment = (row: Record<string, unknown>) => ({
        id: row.id,
        specialistId: row.specialistId,
        serviceId: row.serviceId,
        contactId: row.contactId,
        dealId: row.dealId,
        startsAt: iso(row.startsAt),
        endsAt: iso(row.endsAt),
        status: row.status,
        holdExpiresAt: iso(row.holdExpiresAt),
        bookedBy: { agentId: row.bookedByAgent, channel: row.bookedByChannel },
        note: row.note,
        cancelReason: row.cancelReason,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt)
      })
      const readSpecialists = (rows: ReadonlyArray<Record<string, unknown>>) =>
        decodeSpecialists(rows.map(toSpecialist)).pipe(Effect.orDie)
      const readAppointments = (rows: ReadonlyArray<Record<string, unknown>>) =>
        decodeAppointments(rows.map(toAppointment)).pipe(Effect.orDie)

      const specialistRow = (business: BusinessId, specialist: Specialist) => ({
        businessId: business,
        id: specialist.id,
        name: specialist.name,
        title: specialist.title,
        color: specialist.color,
        userId: specialist.userId,
        active: specialist.active,
        hours: JSON.stringify(specialist.hours),
        serviceIds: JSON.stringify(specialist.serviceIds),
        timeOff: JSON.stringify(specialist.timeOff),
        createdAt: specialist.createdAt
      })
      const appointmentRow = (business: BusinessId, appointment: Appointment) => ({
        businessId: business,
        id: appointment.id,
        specialistId: appointment.specialistId,
        serviceId: appointment.serviceId,
        contactId: appointment.contactId,
        dealId: appointment.dealId,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        status: appointment.status,
        holdExpiresAt: appointment.holdExpiresAt,
        bookedByAgent: appointment.bookedBy.agentId,
        bookedByChannel: appointment.bookedBy.channel,
        note: appointment.note,
        cancelReason: appointment.cancelReason,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt
      })
      const upsert = (table: string, row: object) => {
        const values = row as Record<string, string | number | boolean | null>
        return sql`INSERT INTO ${sql(table)} ${sql.insert(values)}
          ON CONFLICT (business_id, id) DO UPDATE SET ${sql.update(values, ["businessId", "id"])}`
      }
      const busy = sql.literal(busyStatuses.map((status) => `'${status}'`).join(", "))

      const selectAppointments = (business: BusinessId, filter: AppointmentFilter & { readonly id?: string }) =>
        sql<Record<string, unknown>>`SELECT * FROM appointments WHERE business_id = ${business}
          AND (${filter.id ?? null}::text IS NULL OR id = ${filter.id ?? null})
          AND (${filter.from ?? null}::timestamptz IS NULL OR ends_at > ${filter.from ?? null})
          AND (${filter.to ?? null}::timestamptz IS NULL OR starts_at < ${filter.to ?? null})
          AND (${filter.specialistId ?? null}::text IS NULL OR specialist_id = ${filter.specialistId ?? null})
          AND (${filter.contactId ?? null}::text IS NULL OR contact_id = ${filter.contactId ?? null})
          AND (${filter.dealId ?? null}::text IS NULL OR deal_id = ${filter.dealId ?? null})
          ORDER BY starts_at`

      return CalendarStorage.of({
        settings: requireBusiness.pipe(
          Effect.flatMap(
            (business) => sql<{ readonly settings: unknown }>`
              SELECT settings FROM calendar_settings WHERE business_id = ${business}`
          ),
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] === undefined
              ? Effect.succeed(defaultCalendarSettings)
              : decodeSettings({ ...defaultCalendarSettings, ...(rows[0].settings as object) }).pipe(Effect.orDie)
          )
        ),
        saveSettings: (settings) =>
          requireBusiness.pipe(
            Effect.flatMap((business) => {
              const values = { settings: JSON.stringify(settings), enabled: settings.enabled }
              return sql`INSERT INTO calendar_settings ${sql.insert({ businessId: business, ...values })}
                ON CONFLICT (business_id) DO UPDATE SET ${sql.update(values)}`
            }),
            Effect.asVoid,
            Effect.orDie
          ),
        specialists: requireBusiness.pipe(
          Effect.flatMap(
            (business) =>
              sql<Record<string, unknown>>`SELECT * FROM specialists WHERE business_id = ${business} ORDER BY seq`
          ),
          Effect.orDie,
          Effect.flatMap(readSpecialists)
        ),
        findSpecialist: (id) =>
          requireBusiness.pipe(
            Effect.flatMap(
              (business) =>
                sql<Record<string, unknown>>`SELECT * FROM specialists WHERE business_id = ${business} AND id = ${id}`
            ),
            Effect.orDie,
            Effect.flatMap(readSpecialists),
            Effect.map((items) => Option.fromNullishOr(items[0]))
          ),
        saveSpecialist: (specialist) =>
          requireBusiness.pipe(
            Effect.flatMap((business) => upsert("specialists", specialistRow(business, specialist))),
            Effect.asVoid,
            Effect.orDie
          ),
        removeSpecialist: (id) =>
          requireBusiness.pipe(
            Effect.flatMap((business) => sql`DELETE FROM specialists WHERE business_id = ${business} AND id = ${id}`),
            Effect.asVoid,
            Effect.orDie
          ),
        appointments: (filter) =>
          requireBusiness.pipe(
            Effect.flatMap((business) => selectAppointments(business, filter)),
            Effect.orDie,
            Effect.flatMap(readAppointments)
          ),
        findAppointment: (id) =>
          requireBusiness.pipe(
            Effect.flatMap((business) => selectAppointments(business, { id })),
            Effect.orDie,
            Effect.flatMap(readAppointments),
            Effect.map((items) => Option.fromNullishOr(items[0]))
          ),
        take: (appointment, bufferMinutes, now) =>
          requireBusiness.pipe(
            Effect.flatMap((business) =>
              sql.withTransaction(
                Effect.gen(function* () {
                  // Locking the specialist makes bookings for the same person wait for each other.
                  yield* sql`SELECT id FROM specialists
                    WHERE business_id = ${business} AND id = ${appointment.specialistId} FOR UPDATE`
                  const gap = `${bufferMinutes} minutes`
                  const clash = yield* sql<{ readonly id: string }>`SELECT id FROM appointments
                    WHERE business_id = ${business} AND specialist_id = ${appointment.specialistId}
                      AND id <> ${appointment.id} AND status IN (${busy})
                      AND NOT (status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ${now})
                      AND starts_at < ${appointment.endsAt}::timestamptz + ${gap}::interval
                      AND ${appointment.startsAt}::timestamptz < ends_at + ${gap}::interval
                    LIMIT 1`
                  if (clash.length > 0) return yield* Effect.fail(new TimeTaken())
                  yield* upsert("appointments", appointmentRow(business, appointment))
                })
              )
            ),
            Effect.catchTag("SqlError", Effect.die)
          ),
        saveAppointment: (appointment) =>
          requireBusiness.pipe(
            Effect.flatMap((business) => upsert("appointments", appointmentRow(business, appointment))),
            Effect.asVoid,
            Effect.orDie
          ),
        reminders: (ids) =>
          ids.length === 0
            ? Effect.succeed([])
            : requireBusiness.pipe(
                Effect.flatMap(
                  (business) => sql<Record<string, unknown>>`SELECT * FROM appointment_reminders
                    WHERE business_id = ${business} AND appointment_id IN ${sql.in(ids)}`
                ),
                Effect.orDie,
                Effect.flatMap((rows) =>
                  decodeReminders(
                    rows.map(({ businessId: _business, ...row }) => ({
                      ...row,
                      startsAt: iso(row.startsAt),
                      at: iso(row.at)
                    }))
                  ).pipe(Effect.orDie)
                )
              ),
        claimReminder: (log) =>
          requireBusiness.pipe(
            Effect.flatMap(
              (business) => sql<{ readonly appointmentId: string }>`INSERT INTO appointment_reminders
                ${sql.insert({ businessId: business, ...log })} ON CONFLICT DO NOTHING RETURNING appointment_id`
            ),
            Effect.map((rows) => rows.length > 0),
            Effect.orDie
          ),
        saveReminder: (log) =>
          requireBusiness.pipe(
            Effect.flatMap((business) => {
              const values = { businessId: business, ...log }
              return sql`INSERT INTO appointment_reminders ${sql.insert(values)}
                ON CONFLICT (business_id, appointment_id, starts_at, minutes_before)
                DO UPDATE SET ${sql.update({ outcome: log.outcome, reason: log.reason, at: log.at })}`
            }),
            Effect.asVoid,
            Effect.orDie
          ),
        enabledBusinesses: sql<{ readonly businessId: BusinessId }>`
          SELECT business_id FROM calendar_settings WHERE enabled`.pipe(
          Effect.map((rows) => rows.map((row) => row.businessId)),
          Effect.orDie
        )
      })
    })
  )
}
