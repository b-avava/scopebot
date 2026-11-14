import type { Agent, Appointment } from "@scope-bot/domain"
import { ArrowUp } from "lucide-react"
import { useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { clockText } from "./calendarView.ts"

const statusWords: Partial<Record<Appointment["status"], string>> = {
  booked: "not confirmed",
  confirmed: "confirmed",
  pending: "not booked yet",
  held: "held for a chat"
}

const COMING = ["held", "pending", "booked", "confirmed"]

const inText = (minutes: number) => {
  if (minutes <= 0) return "NOW"
  if (minutes < 60) return `IN ${minutes} MIN`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `IN ${hours} H` : `IN ${hours} H ${rest} MIN`
}

const AskBox = ({ agent, onAsk }: { readonly agent: Agent; readonly onAsk: (question: string) => void }) => {
  const [text, setText] = useState("")
  return (
    <form
      className="flex h-11 shrink-0 items-center gap-2.5 rounded-md border bg-field pr-2 pl-3.5 focus-within:ring-2 focus-within:ring-ring"
      onSubmit={(event) => {
        event.preventDefault()
        if (text.trim() !== "") onAsk(text.trim())
      }}
    >
      <input
        aria-label={`Ask ${agent.name} about your day`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={`Ask ${agent.name} about your day`}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        aria-label="Ask"
        disabled={text.trim() === ""}
        className="flex size-[30px] shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <ArrowUp className="size-3.5" />
      </button>
    </form>
  )
}

/**
 * A specialist's own day at a glance: who comes next and what to know before,
 * the rest of the day, and a question for the team assistant.
 */
export const MyDayPanel = ({
  appointments,
  today,
  now,
  agents,
  onOpen,
  onAsk
}: {
  /** The specialist's appointments on the day shown. */
  readonly appointments: ReadonlyArray<Appointment>
  readonly today: boolean
  readonly now: number
  readonly agents: ReadonlyArray<Agent>
  readonly onOpen: (appointment: Appointment) => void
  readonly onAsk: (agentId: string, question: string) => void
}) => {
  const { settings } = useCalendar()
  const { contacts, services } = useCrm()
  const zone = settings.timeZone
  const coming = appointments
    .filter((item) => COMING.includes(item.status) && (!today || Date.parse(item.endsAt) > now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const [next, ...later] = coming
  const assistant = agents.find((agent) => agent.id === settings.assistantId)
  const contact = contacts.find((item) => item.id === next?.contactId)
  const serviceOf = (appointment: Appointment) =>
    services.find((item) => item.id === appointment.serviceId)?.name ?? "Appointment"

  return (
    <aside aria-label="Your next client" className="flex w-[380px] shrink-0 flex-col gap-4 border-l px-6 pt-5 pb-6">
      {next === undefined ? (
        <p className="text-sm text-muted-foreground">{today ? "Nobody else comes today." : "Nobody comes this day."}</p>
      ) : (
        <>
          <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">
            {today ? `NEXT · ${inText(Math.round((Date.parse(next.startsAt) - now) / 60000))}` : "FIRST UP"}
          </span>
          <button type="button" onClick={() => onOpen(next)} className="flex flex-col gap-1 text-left outline-none">
            <span className="text-[22px] leading-7 font-bold tracking-[-0.02em]">{contact?.name ?? "No client"}</span>
            <span className="text-sm text-muted-foreground">
              {serviceOf(next)} · {clockText(next.startsAt, zone)}–{clockText(next.endsAt, zone)}
              {statusWords[next.status] === undefined ? "" : ` · ${statusWords[next.status]}`}
            </span>
          </button>
          {contact?.summary !== null && contact?.summary !== undefined && contact.summary.text !== "" && (
            <div className="flex flex-col gap-2 rounded-md bg-field px-4 py-3.5">
              <span className="text-xs font-semibold text-muted-foreground">Before you start</span>
              <p className="text-[13px] leading-[19px]">{contact.summary.text}</p>
            </div>
          )}
        </>
      )}
      {later.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold text-muted-foreground">
            {today ? "Later today" : "Later that day"}
          </span>
          {later.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item)}
              className="flex items-center gap-2.5 text-left outline-none hover:opacity-80"
            >
              <span className="w-11 shrink-0 text-[13px] font-semibold">{clockText(item.startsAt, zone)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                {contacts.find((one) => one.id === item.contactId)?.name ?? "No client"} ·{" "}
                {item.status === "pending" ? "not booked yet" : serviceOf(item)}
              </span>
            </button>
          ))}
        </div>
      )}
      {assistant !== undefined && <AskBox agent={assistant} onAsk={(question) => onAsk(assistant.id, question)} />}
    </aside>
  )
}
