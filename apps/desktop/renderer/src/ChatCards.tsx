import { type Appointment, type ChatCard, dayOf } from "@scope-bot/domain"
import { ArrowUpRight, CalendarDays } from "lucide-react"
import { useEffect, useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import {
  clockText,
  dayRange,
  isLive,
  lengthMinutes,
  lookLabel,
  lookOf,
  lookTone,
  monthName,
  weekdayName
} from "./calendarView.ts"
import { type CardChanges, cardChanges, changesText } from "./cardChanges.ts"

type DayCard = Extract<ChatCard, { readonly kind: "day" }>

const durationText = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60} h`
      : `${Math.floor(minutes / 60)} h ${minutes % 60} min`

/** "Wed 11 Nov". */
const dayTitle = (day: string) =>
  `${weekdayName(day).slice(0, 3)} ${Number(day.slice(8, 10))} ${monthName(day).slice(0, 3)}`

interface Day {
  readonly appointments: ReadonlyArray<Appointment>
  readonly changes: CardChanges
  /** The ones the answer saw that left the day, as they are now. */
  readonly gone: ReadonlyArray<Appointment>
}

const dayOfCard = async (card: DayCard, timeZone: string): Promise<Day | null> => {
  const { from, to } = dayRange(card.day, 1, timeZone)
  const result = await window.scopeBot.listAppointments(from, to)
  if (!result.ok) return null
  const now = Date.now()
  const appointments = result.value
    .filter((item) => item.specialistId === card.specialistId && item.status !== "cancelled" && isLive(item, now))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  const changes = cardChanges(appointments, card.appointmentIds)
  const found = await Promise.all(changes.gone.map((id) => window.scopeBot.getAppointment(id)))
  return { appointments, changes, gone: found.flatMap((item) => (item.ok ? [item.value] : [])) }
}

/** The day as the calendar has it now, refreshed whenever the chat reloads. */
const useDay = (card: DayCard, refresh: number) => {
  const { settings } = useCalendar()
  const [day, setDay] = useState<Day | null>(null)
  const [failed, setFailed] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new refresh asks the calendar again
  useEffect(() => {
    let current = true
    void dayOfCard(card, settings.timeZone).then((next) => {
      if (!current) return
      setFailed(next === null)
      if (next !== null) setDay(next)
    })
    return () => {
      current = false
    }
  }, [card, settings.timeZone, refresh])

  return { day, failed, timeZone: settings.timeZone }
}

const shortDayTime = (iso: string, timeZone: string) =>
  `${dayTitle(dayOf(new Date(iso), timeZone))}, ${clockText(iso, timeZone)}`

/** Where an appointment went that the answer saw on this day. */
const goneText = (appointment: Appointment, timeZone: string) =>
  appointment.status === "cancelled" ? "Cancelled" : `Moved to ${shortDayTime(appointment.startsAt, timeZone)}`

const Row = ({
  appointment,
  timeZone,
  added = false,
  gone = false
}: {
  readonly appointment: Appointment
  readonly timeZone: string
  readonly added?: boolean
  readonly gone?: boolean
}) => {
  const { contacts, services } = useCrm()
  const look = lookOf(appointment, Date.now())
  const service = services.find((item) => item.id === appointment.serviceId)?.name ?? "Appointment"
  const struck = gone ? "text-muted-foreground line-through" : ""
  return (
    <li className="flex items-center gap-4 px-4 py-3 text-sm">
      <span className={`w-12 shrink-0 font-semibold tabular-nums ${struck}`}>
        {gone ? "—" : clockText(appointment.startsAt, timeZone)}
      </span>
      <span className="flex w-48 shrink-0 items-center gap-2">
        <span className={`truncate font-medium ${struck}`}>
          {contacts.find((item) => item.id === appointment.contactId)?.name ?? "No client"}
        </span>
        {added && (
          <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            New
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {service} · {durationText(lengthMinutes(appointment))}
      </span>
      {gone ? (
        <span className="shrink-0 text-[13px] text-amber-600 dark:text-amber-400">
          {goneText(appointment, timeZone)}
        </span>
      ) : (
        <span className={`shrink-0 text-[13px] ${lookTone[look]}`}>{lookLabel[look]}</span>
      )}
    </li>
  )
}

const Rows = ({ day, timeZone }: { readonly day: Day; readonly timeZone: string }) => (
  <ul className="divide-y">
    {day.appointments.map((appointment) => (
      <Row
        key={appointment.id}
        appointment={appointment}
        timeZone={timeZone}
        added={day.changes.added.has(appointment.id)}
      />
    ))}
    {day.gone.map((appointment) => (
      <Row key={appointment.id} appointment={appointment} timeZone={timeZone} gone />
    ))}
  </ul>
)

/** What the card says when it has no rows to show. */
const emptyText = (day: Day | null, failed: boolean) => {
  if (failed) return "The calendar didn't answer. The card fills in when the chat reloads."
  if (day === null) return "Looking at the calendar…"
  const saw = day.changes.gone.length
  return saw > 0 && day.appointments.length === 0
    ? `All ${saw} ${saw === 1 ? "appointment" : "appointments"} the answer saw moved away. Nothing is on this day now.`
    : "No appointments on this day now."
}

/** One specialist's day, drawn from the calendar and never from what the model wrote (ADR 0024). */
const DayCardView = ({
  card,
  refresh,
  onOpenCalendar
}: {
  readonly card: DayCard
  readonly refresh: number
  readonly onOpenCalendar: (day: string) => void
}) => {
  const { specialists } = useCalendar()
  const { day, failed, timeZone } = useDay(card, refresh)
  const specialist = specialists.find((item) => item.id === card.specialistId)
  const changed = day === null ? null : changesText(day.changes)
  const hasRows = !failed && day !== null && day.appointments.length + day.gone.length > 0
  return (
    <section
      aria-label={`${dayTitle(card.day)} · ${specialist?.name ?? "Calendar"}`}
      className="w-full max-w-[760px] overflow-hidden rounded-card border"
    >
      <header className="flex items-center gap-2.5 border-b px-4 py-3 text-sm">
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {dayTitle(card.day)}
          {specialist === undefined ? "" : ` · ${specialist.name}`}
        </span>
        {changed !== null && (
          <span className="shrink-0 rounded-md bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            {changed}
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpenCalendar(card.day)}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open in Calendar
          <ArrowUpRight className="size-3.5" />
        </button>
      </header>
      {hasRows && day !== null ? (
        <Rows day={day} timeZone={timeZone} />
      ) : (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">{emptyText(day, failed)}</p>
      )}
    </section>
  )
}

/** The records an answer looked up, under its text. */
export const ChatCards = ({
  cards,
  refresh,
  onOpenCalendar
}: {
  readonly cards: ReadonlyArray<ChatCard>
  readonly refresh: number
  readonly onOpenCalendar: (day: string) => void
}) => (
  <div className="flex w-full flex-col gap-3">
    {cards.map((card) => (
      <DayCardView
        key={`${card.kind}:${card.day}:${card.specialistId}`}
        card={card}
        refresh={refresh}
        onOpenCalendar={onOpenCalendar}
      />
    ))}
  </div>
)
