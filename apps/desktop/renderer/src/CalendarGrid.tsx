import { type Agent, type Appointment, type Specialist, weekdayOf } from "@scope-bot/domain"
import { Check, CircleAlert } from "lucide-react"
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react"
import { type DragState, MOVABLE, useCardDrag } from "./CalendarDrag.ts"
import {
  type CardLook,
  clockMinutes,
  clockText,
  isLive,
  lookBar,
  lookCard,
  lookLabel,
  lookOf,
  lookTone,
  minutesText,
  toMinutes
} from "./calendarView.ts"

export interface GridColumn {
  readonly key: string
  readonly day: string
  readonly specialist: Specialist
  readonly header: ReactNode
  /** Whether this column is today, which shows the line of the current time. */
  readonly today: boolean
}

const HATCH =
  "repeating-linear-gradient(135deg, var(--color-muted) 0px, var(--color-muted) 6px, transparent 6px, transparent 12px)"

/** The parts of a day a specialist does not work, as blocks from the top of the grid. */
const offBlocks = (specialist: Specialist, day: string, from: number, to: number) => {
  const timeOff = specialist.timeOff.find((off) => off.from <= day && day <= off.to)
  if (timeOff !== undefined) return { dayOff: timeOff.note === "" ? "Day off" : timeOff.note, blocks: [], breaks: [] }
  const hours = specialist.hours[weekdayOf(day)]
  if (hours === undefined || !hours.open) return { dayOff: "Does not work", blocks: [], breaks: [] }
  const blocks = [
    { top: 0, height: Math.max(0, toMinutes(hours.from) - from) },
    { top: toMinutes(hours.to) - from, height: Math.max(0, to - toMinutes(hours.to)) }
  ].filter((block) => block.height > 0)
  const breaks = hours.breaks.map((item) => ({
    top: toMinutes(item.from) - from,
    height: toMinutes(item.to) - toMinutes(item.from)
  }))
  return { dayOff: null, blocks, breaks }
}

const AgentChip = ({ agent }: { readonly agent: Agent }) => (
  <span className="flex h-5 shrink-0 items-center gap-1 rounded-full bg-background pr-1.5 pl-[3px] text-[11px] font-medium text-muted-foreground">
    <span className="flex size-3.5 items-center justify-center rounded-full" style={{ background: agent.color }}>
      <span className="size-[3px] rounded-full bg-white" />
    </span>
    {agent.name}
  </span>
)

export interface CardText {
  readonly name: string
  readonly service: string
}

/** What the corner of a card says: the status, or how long a held time is still kept. */
const cardLabel = (look: CardLook, appointment: Appointment, now: number) =>
  look === "held" && appointment.holdExpiresAt !== null
    ? `${Math.max(1, Math.ceil((Date.parse(appointment.holdExpiresAt) - now) / 60000))} min left`
    : lookLabel[look]

const CardLines = ({
  look,
  text,
  appointment,
  timeZone,
  short
}: {
  readonly look: CardLook
  readonly text: CardText
  readonly appointment: Appointment
  readonly timeZone: string
  readonly short: boolean
}) => {
  const struck = look === "cancelled" ? "line-through" : ""
  const muted = look === "done" || look === "cancelled" ? "text-muted-foreground" : ""
  const start = clockText(appointment.startsAt, timeZone)
  const time = `${start}–${clockText(appointment.endsAt, timeZone)}`
  return (
    <span className={`flex min-w-0 flex-1 ${short ? "items-center gap-1" : "flex-col gap-0.5"}`}>
      <span className={`truncate text-[13px] leading-4 font-semibold ${muted} ${struck}`}>{text.name}</span>
      <span className={`truncate text-xs leading-4 text-muted-foreground ${struck}`}>
        {short ? `· ${start}` : `${text.service}${text.service === "" ? "" : " · "}${time}`}
      </span>
    </span>
  )
}

const Card = ({
  appointment,
  text,
  timeZone,
  now,
  agent,
  compact,
  selected,
  top,
  height,
  ghost,
  onOpen,
  onTake
}: {
  readonly appointment: Appointment
  readonly text: CardText
  readonly timeZone: string
  readonly now: number
  readonly agent: Agent | undefined
  readonly compact: boolean
  readonly selected: boolean
  readonly top: number
  readonly height: number
  /** Left behind where a dragged card was. */
  readonly ghost: boolean
  readonly onOpen: () => void
  readonly onTake: (event: ReactPointerEvent) => void
}) => {
  const look = lookOf(appointment, now)
  const bar = lookBar[look]
  const short = height < 40
  const byAgent = agent !== undefined && (look === "confirmed" || look === "booked")
  const layout = short ? "items-center gap-2 px-2.5" : "gap-2.5 px-2.5 py-2"
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={onTake}
      style={{ top, height }}
      className={`absolute right-1.5 left-1.5 flex touch-none select-none overflow-hidden rounded-control-sm text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring ${lookCard[look]} ${selected ? "ring-2 ring-foreground" : ""} ${ghost ? "opacity-40 outline-dashed outline-1 outline-muted-foreground" : ""} ${MOVABLE.includes(appointment.status) ? "cursor-grab active:cursor-grabbing" : ""} ${layout}`}
    >
      {bar !== null && (
        <span className={`w-[3px] shrink-0 self-stretch rounded-full ${short ? "my-1.5" : ""} ${bar}`} />
      )}
      {look === "done" && <Check className="size-3.5 shrink-0 self-start text-muted-foreground" strokeWidth={2.4} />}
      <CardLines look={look} text={text} appointment={appointment} timeZone={timeZone} short={short} />
      {!compact && !(look === "confirmed" && byAgent) && (
        <span className={`shrink-0 self-start text-[11px] leading-[14px] font-semibold ${lookTone[look]}`}>
          {cardLabel(look, appointment, now)}
        </span>
      )}
      {!compact && byAgent && agent !== undefined && <AgentChip agent={agent} />}
    </button>
  )
}

/** Statuses that keep their time, as the server counts them. */
const BUSY = ["held", "pending", "booked", "confirmed", "arrived"]

const lengthOf = (appointment: Appointment) =>
  Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60000)

/** Why the dragged card cannot go here, or null when it can. */
const clashOf = (
  appointment: Appointment,
  minutes: number,
  column: GridColumn,
  others: ReadonlyArray<Appointment>,
  bufferMinutes: number,
  timeZone: string,
  textOf: (appointment: Appointment) => CardText,
  now: number
) => {
  if (appointment.serviceId !== null && !column.specialist.serviceIds.includes(appointment.serviceId)) {
    return `${column.specialist.name} does not do ${textOf(appointment).service || "this service"}`
  }
  const end = minutes + lengthOf(appointment)
  const other = others.find((item) => {
    if (item.id === appointment.id || !BUSY.includes(item.status) || !isLive(item, now)) return false
    const start = clockMinutes(item.startsAt, timeZone)
    const stop = start + lengthOf(item)
    return start < end + bufferMinutes && minutes < stop + bufferMinutes
  })
  if (other === undefined) return null
  const who =
    other.status === "pending" ? ", who waits for your OK" : other.status === "held" ? ", held for a chat" : ""
  return `Overlaps ${textOf(other).name} at ${clockText(other.startsAt, timeZone)}${who}`
}

/** The dragged card at its new place, red with the reason when it cannot go there. */
const DragPreview = ({
  appointment,
  text,
  minutes,
  from,
  clash
}: {
  readonly appointment: Appointment
  readonly text: CardText
  readonly minutes: number
  readonly from: number
  readonly clash: string | null
}) => {
  const length = lengthOf(appointment)
  return (
    <>
      <div
        className={`pointer-events-none absolute right-1.5 left-1.5 z-20 flex flex-col gap-0.5 rounded-control-sm border bg-background px-2.5 py-2 shadow-lg ${clash === null ? "border-foreground" : "border-destructive"}`}
        style={{ top: minutes - from + 1, height: Math.max(24, length - 2) }}
      >
        <span className="truncate text-[13px] leading-4 font-semibold">{text.name}</span>
        <span className="truncate text-xs leading-4 font-semibold">
          {minutesText(minutes)}–{minutesText(minutes + length)}
        </span>
      </div>
      {clash !== null && (
        <span
          className="pointer-events-none absolute left-3 z-30 flex items-center gap-1.5 rounded-control-sm border border-destructive bg-background px-2.5 py-1.5 text-xs font-medium shadow-lg"
          style={{ top: minutes - from + Math.max(24, length - 2) + 8 }}
        >
          <CircleAlert className="size-3.5 shrink-0 text-destructive" />
          {clash}
        </span>
      )}
    </>
  )
}

/** One specialist's or one day's column: the hours they work, their appointments, and a dragged card. */
const Column = ({
  column,
  appointments,
  textOf,
  agents,
  timeZone,
  hours,
  now,
  compact,
  selectedId,
  showNow,
  nowMinutes,
  bufferMinutes,
  drag,
  onOpen,
  onTake
}: {
  readonly column: GridColumn
  readonly appointments: ReadonlyArray<Appointment>
  readonly textOf: (appointment: Appointment) => CardText
  readonly agents: ReadonlyArray<Agent>
  readonly timeZone: string
  readonly hours: { readonly from: number; readonly to: number }
  readonly now: number
  readonly compact: boolean
  readonly selectedId: string | null
  readonly showNow: boolean
  readonly nowMinutes: number
  readonly bufferMinutes: number
  readonly drag: DragState | null
  readonly onOpen: (appointment: Appointment) => void
  readonly onTake: (event: ReactPointerEvent, appointment: Appointment, start: number, length: number) => void
}) => {
  const height = hours.to - hours.from
  const lines = Array.from({ length: height / 60 + 1 }, (_, index) => hours.from + index * 60)
  const off = offBlocks(column.specialist, column.day, hours.from, hours.to)
  const here = drag !== null && drag.columnKey === column.key ? drag : null
  return (
    <div
      data-column-key={column.key}
      className={`relative min-w-0 flex-1 border-l ${column.today && compact ? "bg-muted/30" : ""}`}
      style={{ height }}
    >
      {lines.map((minutes) => (
        <span
          key={minutes}
          className="absolute right-0 left-0 h-px bg-border/70"
          style={{ top: minutes - hours.from }}
        />
      ))}
      <OffHours off={off} />
      {appointments
        .filter((appointment) => isLive(appointment, now))
        .map((appointment) => {
          const start = clockMinutes(appointment.startsAt, timeZone)
          const end = clockMinutes(appointment.endsAt, timeZone) || 24 * 60
          return (
            <Card
              key={appointment.id}
              appointment={appointment}
              text={textOf(appointment)}
              timeZone={timeZone}
              now={now}
              agent={agents.find((agent) => agent.id === appointment.bookedBy.agentId)}
              compact={compact}
              selected={selectedId === appointment.id}
              top={start - hours.from + 1}
              height={Math.max(24, end - start - 2)}
              ghost={drag?.appointment.id === appointment.id}
              onOpen={() => onOpen(appointment)}
              onTake={(event) => onTake(event, appointment, start, end - start)}
            />
          )
        })}
      {here !== null && (
        <DragPreview
          appointment={here.appointment}
          text={textOf(here.appointment)}
          minutes={here.minutes}
          from={hours.from}
          clash={
            here.saving
              ? null
              : clashOf(here.appointment, here.minutes, column, appointments, bufferMinutes, timeZone, textOf, now)
          }
        />
      )}
      {showNow && (
        <span
          className="pointer-events-none absolute right-0 left-0 h-0.5 bg-[#E5484D]"
          style={{ top: nowMinutes - hours.from }}
        />
      )}
    </div>
  )
}

/** Hatched days off and breaks, and the hours outside the working day. */
const OffHours = ({ off }: { readonly off: ReturnType<typeof offBlocks> }) =>
  off.dayOff !== null ? (
    <div className="absolute inset-0 flex flex-col items-center pt-48 text-center" style={{ backgroundImage: HATCH }}>
      <span className="text-[13px] font-semibold">{off.dayOff}</span>
    </div>
  ) : (
    <>
      {off.blocks.map((block) => (
        <div
          key={block.top}
          className="absolute right-0 left-0 bg-muted/50"
          style={{ top: block.top, height: block.height }}
        />
      ))}
      {off.breaks.map((block) => (
        <div
          key={block.top}
          className="absolute right-0 left-0 flex items-center justify-center text-xs text-muted-foreground"
          style={{ top: block.top + 1, height: block.height - 1, backgroundImage: HATCH }}
        >
          Break
        </div>
      ))}
    </>
  )

/** Hours down the side and one column per specialist or day, with appointments placed by their time. */
export const CalendarGrid = ({
  columns,
  appointmentsOf,
  textOf,
  agents,
  timeZone,
  hours,
  now,
  compact,
  selectedId,
  bufferMinutes,
  onOpen,
  onMove
}: {
  readonly columns: ReadonlyArray<GridColumn>
  readonly appointmentsOf: (column: GridColumn) => ReadonlyArray<Appointment>
  readonly textOf: (appointment: Appointment) => CardText
  readonly agents: ReadonlyArray<Agent>
  readonly timeZone: string
  readonly hours: { readonly from: number; readonly to: number }
  readonly now: number
  readonly compact: boolean
  readonly selectedId: string | null
  /** Kept free after each appointment, so a dragged card shows the same clashes the server finds. */
  readonly bufferMinutes: number
  readonly onOpen: (appointment: Appointment) => void
  /** A card was dropped on a free time. Not given, cards cannot be dragged. */
  readonly onMove?: (appointment: Appointment, column: GridColumn, minutes: number) => Promise<void>
}) => {
  const { drag, take, swallowClick } = useCardDrag(hours, async (appointment, columnKey, minutes) => {
    const column = columns.find((item) => item.key === columnKey)
    if (column === undefined || onMove === undefined) return
    const clash = clashOf(appointment, minutes, column, appointmentsOf(column), bufferMinutes, timeZone, textOf, now)
    if (clash !== null) return
    await onMove(appointment, column, minutes)
  })
  const height = hours.to - hours.from
  const lines = Array.from({ length: height / 60 + 1 }, (_, index) => hours.from + index * 60)
  const nowMinutes = clockMinutes(new Date(now).toISOString(), timeZone)
  const showNow = columns.some((column) => column.today) && nowMinutes >= hours.from && nowMinutes <= hours.to

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b">
        <div className="flex w-16 shrink-0 items-end pb-2.5 pl-4 text-[11px] text-muted-foreground">
          {timeZone.split("/").at(-1)?.replace("_", " ")}
        </div>
        {columns.map((column) => (
          <div key={column.key} className="min-w-0 flex-1 border-l">
            {column.header}
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex pt-3 pb-6" style={{ height: height + 36 }}>
          <div className="relative w-16 shrink-0">
            {lines.map((minutes) => (
              <span
                key={minutes}
                className="absolute left-4 -translate-y-1/2 text-xs text-muted-foreground"
                style={{ top: minutes - hours.from }}
              >
                {minutesText(minutes)}
              </span>
            ))}
          </div>
          {columns.map((column) => (
            <Column
              key={column.key}
              column={column}
              appointments={appointmentsOf(column)}
              textOf={textOf}
              agents={agents}
              timeZone={timeZone}
              hours={hours}
              now={now}
              compact={compact}
              selectedId={selectedId}
              showNow={showNow && column.today}
              nowMinutes={nowMinutes}
              bufferMinutes={bufferMinutes}
              drag={drag}
              onOpen={(appointment) => {
                if (!swallowClick()) onOpen(appointment)
              }}
              onTake={take}
            />
          ))}
          {showNow && (
            <span
              className="pointer-events-none absolute left-3 rounded-md bg-[#E5484D] px-1.5 text-[11px] leading-4 font-bold text-white"
              style={{ top: 12 + nowMinutes - hours.from - 8 }}
            >
              {minutesText(nowMinutes)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
