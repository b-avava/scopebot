import { type Appointment, type AppointmentStep, type ChatMessage, dayOf } from "@scope-bot/domain"
import { ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { clockText, lengthMinutes, shortDay, weekdayName } from "./calendarView.ts"
import { errorMessage } from "./hooks.ts"

const OPEN = ["pending", "booked", "confirmed"]

type Suggestion = Extract<AppointmentStep, { readonly kind: "move" | "cancel" }>

/** Only moves and cancels are suggested to the team. */
export const suggestionOf = (message: ChatMessage): Suggestion | null =>
  message.role === "agent" && message.appointment !== undefined && message.appointment.kind !== "book"
    ? message.appointment
    : null

const useAppointment = (id: string, decided: string | undefined) => {
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: asks again once the person decided.
  useEffect(() => {
    let current = true
    void window.scopeBot.getAppointment(id).then((result) => {
      if (current && result.ok) setAppointment(result.value)
    })
    return () => {
      current = false
    }
  }, [id, decided])
  return appointment
}

const Actions = ({
  step,
  client,
  busy,
  onDecide,
  onAnotherTime
}: {
  readonly step: Suggestion
  readonly client: string
  readonly busy: boolean
  readonly onDecide: (decision: "do" | "leave") => void
  readonly onAnotherTime: () => void
}) => (
  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      disabled={busy}
      onClick={() => onDecide("do")}
      className="h-[34px] rounded-[12px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {step.kind === "move" ? "Move" : "Cancel"} and tell {client}
    </button>
    {step.kind === "move" && (
      <button
        type="button"
        disabled={busy}
        onClick={onAnotherTime}
        className="h-[34px] rounded-[12px] border px-3.5 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        Another time
      </button>
    )}
    <button
      type="button"
      disabled={busy}
      onClick={() => onDecide("leave")}
      className="h-[34px] rounded-[12px] px-2.5 text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      Leave it
    </button>
  </div>
)

const decidedText = { done: "Done.", left: "Left as it was." }

/**
 * What an employee suggests doing with an appointment in a chat with the team.
 * Nothing changes until the person agrees, and then the client is told.
 */
export const SuggestionCard = ({
  agentId,
  conversationId,
  message,
  step,
  onChanged,
  onAnotherTime
}: {
  readonly agentId: string
  readonly conversationId: string
  readonly message: ChatMessage
  readonly step: Suggestion
  readonly onChanged: () => Promise<void>
  readonly onAnotherTime: () => void
}) => {
  const { settings } = useCalendar()
  const { contacts, services } = useCrm()
  const appointment = useAppointment(step.appointmentId, step.decided)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = async (decision: "do" | "leave") => {
    setBusy(true)
    const result = await window.scopeBot.decideSuggestion(agentId, conversationId, message.id, decision)
    setError(result.ok ? null : errorMessage(result.error))
    await onChanged()
    setBusy(false)
  }

  const zone = settings.timeZone
  const when = (iso: string) => {
    const day = dayOf(new Date(iso), zone)
    return `${weekdayName(day)} ${shortDay(day)}, ${clockText(iso, zone)}`
  }
  const name = contacts.find((item) => item.id === appointment?.contactId)?.name ?? "The client"
  const first = name.split(" ")[0] ?? name
  const service = services.find((item) => item.id === appointment?.serviceId)?.name ?? "Appointment"
  const waiting = step.decided === undefined && appointment !== null && OPEN.includes(appointment.status)

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-3 rounded-[16px] border border-dashed border-amber-400 bg-amber-400/5 p-4">
      <p className="whitespace-pre-wrap text-sm leading-5">{message.text}</p>
      {appointment !== null && (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm text-muted-foreground line-through">{when(appointment.startsAt)}</span>
          {step.kind === "move" && (
            <>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{when(step.startsAt)}</span>
            </>
          )}
          <span className="text-[13px] text-muted-foreground">
            · {name} · {service}, {lengthMinutes(appointment)} min
          </span>
        </div>
      )}
      {waiting && (
        <>
          <p className="text-xs text-muted-foreground">
            {step.kind === "move"
              ? `${first} gets a message about the new time in their chat. The reminders move with it.`
              : `${first} gets a message in their chat that it is cancelled.`}
          </p>
          <Actions
            step={step}
            client={first}
            busy={busy}
            onDecide={(decision) => void decide(decision)}
            onAnotherTime={onAnotherTime}
          />
        </>
      )}
      {step.decided !== undefined && <p className="text-xs text-muted-foreground">{decidedText[step.decided]}</p>}
      {step.decided === undefined && appointment !== null && !waiting && (
        <p className="text-xs text-muted-foreground">The appointment changed in the meantime.</p>
      )}
      {error !== null && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
