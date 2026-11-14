import { type Agent, type Appointment, atZoned } from "@scope-bot/domain"
import { Clock, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { BridgeError } from "../../preload/bridge.ts"
import type { GridColumn } from "./CalendarGrid.tsx"
import { clockText, isLive } from "./calendarView.ts"
import { errorMessage } from "./hooks.ts"

const NOTICE_MS = 10_000

const channelNames = { whatsapp: "WhatsApp", telegram: "Telegram", instagram: "Instagram" }

/** A dragged card the server would not move, with where it was meant to go. */
export interface FailedMove {
  readonly appointment: Appointment
  readonly specialistId: string
  readonly startsAt: string
  readonly error: BridgeError
}

/** Who took the time a card was dropped on, from the appointments as they are now. */
const takerOf = (failed: FailedMove, appointments: ReadonlyArray<Appointment>) => {
  const start = Date.parse(failed.startsAt)
  const end = start + Date.parse(failed.appointment.endsAt) - Date.parse(failed.appointment.startsAt)
  return appointments.find(
    (item) =>
      item.id !== failed.appointment.id &&
      item.specialistId === failed.specialistId &&
      item.status !== "cancelled" &&
      item.status !== "no-show" &&
      isLive(item, Date.now()) &&
      Date.parse(item.startsAt) < end &&
      start < Date.parse(item.endsAt)
  )
}

const takenBy = (taker: Appointment | undefined, agents: ReadonlyArray<Agent>) => {
  const agent = agents.find((item) => item.id === taker?.bookedBy.agentId)
  if (agent === undefined) return "Someone else booked it a moment ago."
  const channel = taker?.bookedBy.channel
  return `${agent.name} booked it${channel === null || channel === undefined ? "" : ` in ${channelNames[channel]}`} a moment ago.`
}

/**
 * Moves an appointment where its card was dropped. When the server says no, it keeps
 * why, so the screen can tell the person and offer other times.
 */
export const useDropMove = (timeZone: string, onMoved: () => Promise<void>) => {
  const [failed, setFailed] = useState<FailedMove | null>(null)

  useEffect(() => {
    if (failed === null) return
    const timer = setTimeout(() => setFailed(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [failed])

  const move = useCallback(
    async (appointment: Appointment, column: GridColumn, minutes: number) => {
      const startsAt = atZoned(column.day, minutes, timeZone).toISOString()
      const same = startsAt === appointment.startsAt && column.specialist.id === appointment.specialistId
      if (same) return
      const result = await window.scopeBot.moveAppointment(appointment.id, {
        specialistId: column.specialist.id,
        startsAt
      })
      await onMoved()
      setFailed(result.ok ? null : { appointment, specialistId: column.specialist.id, startsAt, error: result.error })
    },
    [timeZone, onMoved]
  )

  return { failed, move, dismiss: () => setFailed(null) }
}

/** Tells the person a dropped card stayed where it was, and why. */
export const MoveNotice = ({
  failed,
  appointments,
  agents,
  clientName,
  timeZone,
  onOtherTimes,
  onClose
}: {
  readonly failed: FailedMove
  readonly appointments: ReadonlyArray<Appointment>
  readonly agents: ReadonlyArray<Agent>
  readonly clientName: string
  readonly timeZone: string
  readonly onOtherTimes: () => void
  readonly onClose: () => void
}) => {
  const taken = failed.error === "time-taken"
  const stays = `${clientName} stays at ${clockText(failed.appointment.startsAt, timeZone)}.`
  return (
    <div
      role="status"
      className="absolute bottom-6 left-1/2 z-40 flex w-[560px] max-w-[calc(100%-48px)] -translate-x-1/2 items-center gap-3.5 rounded-card border bg-background px-4 py-3 shadow-xl"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
        <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {taken ? `${clockText(failed.startsAt, timeZone)} was just taken` : "It could not be moved"}
        </span>
        <span className="text-xs text-muted-foreground">
          {taken ? takenBy(takerOf(failed, appointments), agents) : errorMessage(failed.error)} {stays}
        </span>
      </span>
      <button
        type="button"
        onClick={onOtherTimes}
        className="h-8 shrink-0 rounded-control-sm border px-3 text-[13px] font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        Other times
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
