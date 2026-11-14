import { type Appointment, type AppointmentStep, dayOf } from "@scope-bot/domain"
import { CalendarDays } from "lucide-react"
import { useEffect, useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { clockText, shortDay, weekdayName } from "./calendarView.ts"

const verbs: Record<AppointmentStep["kind"], string> = { book: "book", move: "move", cancel: "cancel" }

/** What a drafted reply does to an appointment, for the draft's title and its send button. */
export const stepVerb = (step: AppointmentStep | undefined) => (step === undefined ? null : verbs[step.kind])

const minutesLeft = (appointment: Appointment) =>
  appointment.holdExpiresAt === null ? 0 : Math.ceil((Date.parse(appointment.holdExpiresAt) - Date.now()) / 60000)

/** The appointment a drafted reply books, moves or cancels when a person sends it. */
export const DraftAppointment = ({
  step,
  contactId
}: {
  readonly step: AppointmentStep
  readonly contactId: string | null
}) => {
  const { settings, specialists } = useCalendar()
  const { services, pipelines } = useCrm()
  const [appointment, setAppointment] = useState<Appointment | null>(null)

  useEffect(() => {
    if (contactId === null) return
    let current = true
    void window.scopeBot.listLinkedAppointments({ contactId }).then((result) => {
      if (current && result.ok) setAppointment(result.value.find((item) => item.id === step.appointmentId) ?? null)
    })
    return () => {
      current = false
    }
  }, [contactId, step.appointmentId])

  if (appointment === null) return null
  const zone = settings.timeZone
  const startsAt = step.kind === "move" ? step.startsAt : appointment.startsAt
  const length = Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)
  const endsAt = new Date(Date.parse(startsAt) + length).toISOString()
  const day = dayOf(new Date(startsAt), zone)
  const when = `${weekdayName(day)} ${shortDay(day)}, ${clockText(startsAt, zone)}–${clockText(endsAt, zone)}`
  const service = services.find((item) => item.id === appointment.serviceId)?.name ?? "Appointment"
  const specialist = specialists.find((item) => item.id === appointment.specialistId)?.name ?? ""
  const stage = pipelines
    .flatMap((pipeline) => pipeline.stages)
    .find((item) => item.id === settings.stageRules.booked)?.name
  const before = dayOf(new Date(appointment.startsAt), zone)
  const details = {
    book: [
      specialist,
      stage === undefined ? "" : `deal goes to ${stage}`,
      settings.reminders.some((item) => item.enabled) ? "reminders on" : ""
    ],
    move: [specialist, `was ${weekdayName(before)} ${shortDay(before)}, ${clockText(appointment.startsAt, zone)}`],
    cancel: [specialist, step.kind === "cancel" ? step.reason : ""]
  }[step.kind].filter((part) => part !== "")
  const title = { book: `Book ${service}`, move: `Move ${service} to`, cancel: `Cancel ${service}` }[step.kind]
  const left = step.kind === "book" && appointment.status === "held" ? minutesLeft(appointment) : null

  return (
    <div className="flex items-center gap-3 rounded-[12px] border bg-background px-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted">
        <CalendarDays className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[13px] leading-[18px] font-semibold">
          {title} · {when}
        </span>
        <span className="truncate text-xs text-muted-foreground">{details.join(" · ")}</span>
      </span>
      {left !== null && (
        <span
          className={`shrink-0 text-xs font-semibold ${left > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
        >
          {left > 0 ? `Held ${left} min` : "Hold ran out"}
        </span>
      )}
    </div>
  )
}
