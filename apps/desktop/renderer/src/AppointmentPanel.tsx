import {
  type Activity,
  type Agent,
  type Appointment,
  type AppointmentOutcome,
  type CalendarSettings,
  type Deal,
  dayOf,
  type Pipeline,
  type Reminder,
  type ReminderLog,
  type Specialist
} from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Check, Minus, X } from "lucide-react"
import { useEffect, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { useCrm } from "./CrmContext.tsx"
import { clockText, initials, lengthMinutes, longDay, lookLabel, lookOf, lookTone, shortDay } from "./calendarView.ts"
import { money } from "./crmStats.ts"
import { errorMessage } from "./hooks.ts"

const sectionTitle = "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground"

const Person = ({
  name,
  line,
  color,
  action,
  onAction
}: {
  readonly name: string
  readonly line: string
  readonly color: string
  readonly action?: string
  readonly onAction?: () => void
}) => (
  <div className="flex items-center gap-3">
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
      style={{ background: color }}
    >
      {initials(name)}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold">{name}</span>
      <span className="truncate text-xs text-muted-foreground">{line}</span>
    </span>
    {action !== undefined && (
      <button
        type="button"
        onClick={onAction}
        className="rounded-sm text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {action}
      </button>
    )}
  </div>
)

/** "A day before", "2 hours before". */
const beforeText = (minutes: number) => {
  const days = Math.round(minutes / (24 * 60))
  if (minutes >= 24 * 60) return days === 1 ? "A day before" : `${days} days before`
  const hours = Math.round(minutes / 60)
  if (minutes >= 60) return hours === 1 ? "An hour before" : `${hours} hours before`
  return `${minutes} min before`
}

/** What happened to the reminders of an appointment. A moved one starts over. */
const useReminderLogs = (appointment: Appointment) => {
  const [logs, setLogs] = useState<ReadonlyArray<ReminderLog>>([])
  // biome-ignore lint/correctness/useExhaustiveDependencies: asks again when the appointment changes.
  useEffect(() => {
    let current = true
    void window.scopeBot.listAppointmentReminders(appointment.id).then((result) => {
      if (current && result.ok) setLogs(result.value)
    })
    return () => {
      current = false
    }
  }, [appointment.id, appointment.updatedAt])
  return logs.filter((log) => Date.parse(log.startsAt) === Date.parse(appointment.startsAt))
}

const ReminderMark = ({ log }: { readonly log: ReminderLog | undefined }) => {
  if (log?.outcome === "sent") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#3CBF6E]">
        <Check className="size-3 text-[#0A0A0A]" strokeWidth={3} />
      </span>
    )
  }
  if (log?.outcome === "failed") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive">
        <X className="size-3 text-white" strokeWidth={3} />
      </span>
    )
  }
  if (log?.outcome === "skipped") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
        <Minus className="size-3 text-muted-foreground" strokeWidth={3} />
      </span>
    )
  }
  return <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-muted-foreground/60" />
}

const ReminderRow = ({
  reminder,
  log,
  appointment,
  timeZone
}: {
  readonly reminder: Reminder
  readonly log: ReminderLog | undefined
  readonly appointment: Appointment
  readonly timeZone: string
}) => {
  const planned = new Date(Date.parse(appointment.startsAt) - reminder.minutesBefore * 60000).toISOString()
  const at = log?.at ?? planned
  const day = dayOf(new Date(at), timeZone)
  const moment = `${shortDay(day)} ${clockText(at, timeZone)}`
  const title =
    log === undefined
      ? `${longDay(day).split(",")[0]} ${clockText(at, timeZone)}`
      : log.outcome === "sent"
        ? `sent ${moment}`
        : "not sent"
  const line =
    log === undefined
      ? "Planned. It goes to the chat the client used."
      : log.outcome === "sent"
        ? "Went to the client's chat."
        : log.reason
  return (
    <div className="flex items-start gap-2.5">
      <ReminderMark log={log} />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold">
          {beforeText(reminder.minutesBefore)} · {title}
        </span>
        <span className={`text-xs ${log?.outcome === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
          {line}
        </span>
      </span>
    </div>
  )
}

/** The reminders of this appointment: what went out, and what is still planned by the rules. */
const Reminders = ({
  appointment,
  settings
}: {
  readonly appointment: Appointment
  readonly settings: CalendarSettings
}) => {
  const logs = useReminderLogs(appointment)
  const shown = settings.reminders.filter(
    (item) => item.enabled || logs.some((log) => log.minutesBefore === item.minutesBefore)
  )
  if (shown.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <span className={sectionTitle}>REMINDERS</span>
      {shown.map((reminder) => (
        <ReminderRow
          key={reminder.minutesBefore}
          reminder={reminder}
          log={logs.find((log) => log.minutesBefore === reminder.minutesBefore)}
          appointment={appointment}
          timeZone={settings.timeZone}
        />
      ))}
    </div>
  )
}

const DealBlock = ({
  deal,
  pipeline,
  currency,
  movesOn
}: {
  readonly deal: Deal
  readonly pipeline: Pipeline
  readonly currency: string
  readonly movesOn: boolean
}) => {
  const stageIndex = pipeline.stages.findIndex((stage) => stage.id === deal.stageId)
  return (
    <div className="flex flex-col gap-2.5">
      <span className={sectionTitle}>DEAL</span>
      <div className="flex flex-col gap-2.5 rounded-card bg-field px-3.5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex-1 truncate">{deal.title}</span>
          {money(deal.amount)} {currency}
        </div>
        <div className="flex gap-1">
          {pipeline.stages.map((stage, index) => (
            <span
              key={stage.id}
              className={`h-1 flex-1 rounded-full ${index <= stageIndex ? "bg-foreground" : "bg-border"}`}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          <b className="text-foreground">{pipeline.stages[stageIndex]?.name}</b>
          {movesOn ? " · moves on by itself when the client comes" : ""}
        </span>
      </div>
    </div>
  )
}

const History = ({ items, timeZone }: { readonly items: ReadonlyArray<Activity>; readonly timeZone: string }) =>
  items.length === 0 ? null : (
    <div className="flex flex-col gap-2">
      <span className={sectionTitle}>HISTORY</span>
      {items.map((item) => (
        <p key={item.id} className="text-xs text-muted-foreground">
          <span className="text-foreground">{shortDay(dayOf(new Date(item.createdAt), timeZone))}</span>{" "}
          {clockText(item.createdAt, timeZone)} · {item.text}
        </p>
      ))}
    </div>
  )

const Actions = ({
  appointment,
  busy,
  onApprove,
  onRecord,
  onMove,
  onCancel
}: {
  readonly appointment: Appointment
  readonly busy: boolean
  readonly onApprove: () => void
  readonly onRecord: (outcome: AppointmentOutcome) => void
  readonly onMove: () => void
  readonly onCancel: () => void
}) => {
  const main =
    appointment.status === "pending" ? (
      <>
        <Button disabled={busy} onClick={onApprove}>
          Book it
        </Button>
        <Button variant="outline" disabled={busy} onClick={onMove}>
          Another time
        </Button>
      </>
    ) : appointment.status === "held" ? (
      <span className="text-[13px] text-muted-foreground">Kept while the client decides in the chat.</span>
    ) : (
      <>
        <Button disabled={busy} onClick={() => onRecord("arrived")}>
          Came
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onRecord("no-show")}>
          Didn't come
        </Button>
        {appointment.status === "booked" ? (
          <Button variant="outline" disabled={busy} onClick={() => onRecord("confirmed")}>
            Confirmed
          </Button>
        ) : (
          <Button variant="outline" disabled={busy} onClick={onMove}>
            Move
          </Button>
        )}
      </>
    )
  return (
    <div className="flex items-center gap-2 border-t px-5 py-4">
      {main}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-sm text-sm font-semibold text-destructive outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {appointment.status === "pending" ? "Decline" : "Cancel"}
      </button>
    </div>
  )
}

const Head = ({
  appointment,
  serviceName,
  agent,
  timeZone,
  onClose
}: {
  readonly appointment: Appointment
  readonly serviceName: string
  readonly agent: Agent | undefined
  readonly timeZone: string
  readonly onClose: () => void
}) => {
  const look = lookOf(appointment, Date.now())
  return (
    <div className="flex flex-col gap-2.5 border-b px-5 pt-5 pb-[18px]">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-semibold ${lookTone[look]}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {lookLabel[look]}
        </span>
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {agent === undefined ? "Booked by a person" : `Booked by ${agent.name}`}
          {appointment.bookedBy.channel === null ? "" : ` in ${appointment.bookedBy.channel}`}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>
      <h2 className="text-[22px] leading-7 font-bold tracking-tight">{serviceName}</h2>
      <p className="text-sm">
        {longDay(dayOf(new Date(appointment.startsAt), timeZone))} ·{" "}
        <b>
          {clockText(appointment.startsAt, timeZone)}–{clockText(appointment.endsAt, timeZone)}
        </b>{" "}
        <span className="text-muted-foreground">· {lengthMinutes(appointment)} min</span>
      </p>
    </div>
  )
}

/** One appointment, opened from the calendar: who, when, the deal, and what a person can do with it. */
export const AppointmentPanel = ({
  appointment,
  specialist,
  settings,
  agents,
  onClose,
  onMove,
  onCancel,
  onChanged
}: {
  readonly appointment: Appointment
  readonly specialist: Specialist | undefined
  readonly settings: CalendarSettings
  readonly agents: ReadonlyArray<Agent>
  readonly onClose: () => void
  readonly onMove: () => void
  readonly onCancel: () => void
  readonly onChanged: (appointment: Appointment) => void
}) => {
  const { contacts, services, deals, pipelines, activities, currency } = useCrm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contact = contacts.find((item) => item.id === appointment.contactId)
  const deal = deals.find((item) => item.id === appointment.dealId)
  const pipeline = pipelines.find((item) => item.id === deal?.pipelineId)
  const history = activities
    .filter((item) => item.kind === "event" && (item.dealId === deal?.id || item.contactId === contact?.id))
    .filter((item) => item.dealId !== null || item.contactId !== null)
    .slice(-4)
  const open = ["held", "pending", "booked", "confirmed"].includes(appointment.status)

  const run = async (request: Promise<BridgeResult<Appointment>>) => {
    setBusy(true)
    const result = await request
    setBusy(false)
    if (result.ok) {
      setError(null)
      onChanged(result.value)
    } else setError(errorMessage(result.error))
  }

  return (
    <aside
      aria-label="Appointment"
      className="absolute top-0 right-0 bottom-0 z-10 flex w-[440px] flex-col border-l bg-background shadow-[-24px_0_48px_rgba(0,0,0,0.25)]"
    >
      <Head
        appointment={appointment}
        serviceName={services.find((item) => item.id === appointment.serviceId)?.name ?? "Appointment"}
        agent={agents.find((item) => item.id === appointment.bookedBy.agentId)}
        timeZone={settings.timeZone}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-5 py-[18px]">
        <div className="flex flex-col gap-3.5">
          <Person
            name={contact?.name ?? "No client"}
            line={
              contact === undefined
                ? "Not linked to a contact"
                : contact.channels.phone || contact.channels.whatsapp || contact.channels.telegram || "No phone saved"
            }
            color="#3B8BEB"
          />
          {specialist !== undefined && (
            <Person
              name={specialist.name}
              line={specialist.title}
              color={specialist.color}
              {...(open ? { action: "Change", onAction: onMove } : {})}
            />
          )}
        </div>
        {deal !== undefined && pipeline !== undefined && (
          <DealBlock
            deal={deal}
            pipeline={pipeline}
            currency={currency}
            movesOn={settings.stageRules.arrived !== null}
          />
        )}
        {open && <Reminders appointment={appointment} settings={settings} />}
        {appointment.note !== "" && (
          <div className="flex flex-col gap-1.5">
            <span className={sectionTitle}>NOTE</span>
            <p className="text-[13px]">{appointment.note}</p>
          </div>
        )}
        {appointment.cancelReason !== "" && (
          <p className="text-[13px] text-muted-foreground">Cancelled: {appointment.cancelReason}</p>
        )}
        <History items={history} timeZone={settings.timeZone} />
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {open && (
        <Actions
          appointment={appointment}
          busy={busy}
          onApprove={() => void run(window.scopeBot.approveAppointment(appointment.id))}
          onRecord={(outcome) => void run(window.scopeBot.recordAppointment(appointment.id, outcome))}
          onMove={onMove}
          onCancel={onCancel}
        />
      )}
    </aside>
  )
}
