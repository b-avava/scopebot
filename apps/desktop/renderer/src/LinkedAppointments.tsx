import { type Appointment, dayOf } from "@scope-bot/domain"
import { Check, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { clockText, lookLabel, lookOf, lookTone, shortDay, weekdayName } from "./calendarView.ts"

const Row = ({ appointment, now }: { readonly appointment: Appointment; readonly now: number }) => {
  const { settings, specialists } = useCalendar()
  const { services } = useCrm()
  const look = lookOf(appointment, now)
  const upcoming = Date.parse(appointment.startsAt) > now && appointment.status !== "cancelled"
  const day = dayOf(new Date(appointment.startsAt), settings.timeZone)
  const service = services.find((item) => item.id === appointment.serviceId)
  const specialist = specialists.find((item) => item.id === appointment.specialistId)
  return (
    <div
      key={appointment.id}
      className={`flex items-center gap-3 border-b px-4 py-3 last:border-b-0 ${upcoming ? "bg-muted/40" : ""}`}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {look === "done" ? (
          <Check className="size-3.5 text-muted-foreground" strokeWidth={2.6} />
        ) : look === "no-show" || look === "cancelled" ? (
          <X className="size-3.5 text-muted-foreground" strokeWidth={2.6} />
        ) : (
          <span className="size-3.5 rounded-full border-2 border-[#3CBF6E]" />
        )}
      </span>
      <span className={`w-[128px] shrink-0 text-[13px] ${upcoming ? "font-semibold" : "text-muted-foreground"}`}>
        {weekdayName(day)} {shortDay(day)}, {clockText(appointment.startsAt, settings.timeZone)}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] ${upcoming ? "font-semibold" : "text-muted-foreground"}`}>
        {service?.name ?? "Appointment"}
        {specialist === undefined ? "" : ` · ${specialist.name}`}
      </span>
      <span className={`shrink-0 text-xs font-semibold ${lookTone[look]}`}>{lookLabel[look]}</span>
    </div>
  )
}

/** The appointments of a deal or a client, newest last, when the calendar is on. */
export const LinkedAppointments = ({
  dealId,
  contactId
}: {
  readonly dealId?: string
  readonly contactId?: string
}) => {
  const { settings } = useCalendar()
  const [appointments, setAppointments] = useState<ReadonlyArray<Appointment>>([])

  useEffect(() => {
    if (!settings.enabled) return
    let current = true
    void window.scopeBot
      .listLinkedAppointments({
        ...(dealId === undefined ? {} : { dealId }),
        ...(contactId === undefined ? {} : { contactId })
      })
      .then((result) => {
        if (current && result.ok) setAppointments(result.value.filter((item) => item.status !== "held"))
      })
    return () => {
      current = false
    }
  }, [settings.enabled, dealId, contactId])

  if (!settings.enabled || appointments.length === 0) return null
  const now = Date.now()
  const came = appointments.filter((item) => item.status === "arrived").length
  const past = appointments.filter((item) => item.status === "arrived" || item.status === "no-show").length

  return (
    <section aria-label="Appointments" className="flex flex-col rounded-card border">
      <div className="flex items-center border-b px-4 py-3">
        <span className="flex-1 text-sm font-semibold">Appointments</span>
        {past > 0 && (
          <span className="text-xs text-muted-foreground">
            Came {came} of {past}
          </span>
        )}
      </div>
      {appointments.map((appointment) => (
        <Row key={appointment.id} appointment={appointment} now={now} />
      ))}
    </section>
  )
}
