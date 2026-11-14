import { type Agent, type Appointment, dayOf } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Clock } from "lucide-react"
import { useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { clockText, longDay } from "./calendarView.ts"
import { errorMessage } from "./hooks.ts"

/** What AI employees asked to book. Each time is kept for the client until a person decides. */
export const CalendarWaiting = ({
  agents,
  onMove,
  onDecline,
  onChanged
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly onMove: (appointment: Appointment) => void
  readonly onDecline: (appointment: Appointment) => void
  readonly onChanged: () => void
}) => {
  const { waiting, settings, specialists } = useCalendar()
  const { contacts, services } = useCrm()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const approve = async (appointment: Appointment) => {
    setBusy(appointment.id)
    const result = await window.scopeBot.approveAppointment(appointment.id)
    setBusy(null)
    setError(result.ok ? null : errorMessage(result.error))
    onChanged()
  }

  if (waiting.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span className="text-base font-semibold">Nothing waits for your OK</span>
        <span className="max-w-[380px] text-[13px] text-muted-foreground">
          When an AI employee may book only after asking, the booking shows up here with the time kept for the client.
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-6">
      {waiting.map((appointment) => {
        const agent = agents.find((item) => item.id === appointment.bookedBy.agentId)
        const contact = contacts.find((item) => item.id === appointment.contactId)
        const service = services.find((item) => item.id === appointment.serviceId)
        const specialist = specialists.find((item) => item.id === appointment.specialistId)
        return (
          <section
            key={appointment.id}
            className="flex flex-col gap-3.5 rounded-card border border-dashed border-amber-400 bg-amber-400/5 px-5 py-[18px]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-[22px] items-center justify-center rounded-full"
                style={{ background: agent?.color ?? "var(--color-muted)" }}
              >
                <span className="size-[5px] rounded-full bg-white" />
              </span>
              <span className="flex-1 text-[13px] text-muted-foreground">
                <b className="text-foreground">{agent?.name ?? "An employee"}</b> wants to book
                {appointment.bookedBy.channel === null ? "" : ` · ${appointment.bookedBy.channel}`}
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Held for {contact?.name.split(" ")[0] ?? "the client"}
              </span>
            </div>
            <div className="flex items-end gap-6">
              <div className="flex flex-1 flex-col gap-1">
                <h3 className="text-xl font-bold tracking-tight">
                  {contact?.name ?? "No client"} · {service?.name ?? "Appointment"}
                </h3>
                <p className="text-sm">
                  {longDay(dayOf(new Date(appointment.startsAt), settings.timeZone))} ·{" "}
                  <b>
                    {clockText(appointment.startsAt, settings.timeZone)}–
                    {clockText(appointment.endsAt, settings.timeZone)}
                  </b>
                  <span className="text-muted-foreground">
                    {specialist === undefined ? "" : ` · ${specialist.name}`}
                  </span>
                </p>
                {appointment.note !== "" && <p className="text-[13px] text-muted-foreground">{appointment.note}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button disabled={busy !== null} onClick={() => void approve(appointment)}>
                  Book it
                </Button>
                <Button variant="outline" disabled={busy !== null} onClick={() => onMove(appointment)}>
                  Another time
                </Button>
                <Button variant="ghost" disabled={busy !== null} onClick={() => onDecline(appointment)}>
                  Decline
                </Button>
              </div>
            </div>
          </section>
        )
      })}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="flex items-center gap-2.5 px-1 text-xs text-muted-foreground">
        <Clock className="size-4" />
        The time stays kept for the client until you answer.
      </p>
    </div>
  )
}
