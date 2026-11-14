import {
  type Account,
  type Agent,
  type Appointment,
  addDays,
  dayOf,
  type Specialist,
  weekdayOf
} from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { AppointmentPanel } from "./AppointmentPanel.tsx"
import { type Booking, BookingModal } from "./BookingModal.tsx"
import { useCalendar } from "./CalendarContext.tsx"
import { CalendarGrid, type GridColumn } from "./CalendarGrid.tsx"
import { CalendarSettingsView } from "./CalendarSettingsView.tsx"
import { CalendarSidebar } from "./CalendarSidebar.tsx"
import { CalendarWaiting } from "./CalendarWaiting.tsx"
import { CancelModal } from "./CancelModal.tsx"
import { useCrm } from "./CrmContext.tsx"
import { Tab } from "./CrmParts.tsx"
import {
  dayNumber,
  dayRange,
  gridHours,
  initials,
  isLive,
  longDay,
  monthName,
  shortDay,
  today,
  weekdayName,
  weekStart
} from "./calendarView.ts"
import { errorMessage } from "./hooks.ts"
import { MoveNotice, useDropMove } from "./MoveNotice.tsx"
import { MyDayPanel } from "./MyDayPanel.tsx"
import { TitleBar } from "./TitleBar.tsx"

const REFRESH_MS = 30_000

type CalendarTab = "day" | "week" | "waiting" | "settings"

const hoursText = (specialist: Specialist, day: string) => {
  const hours = specialist.hours[weekdayOf(day)]
  return hours?.open ? `${hours.from}–${hours.to}` : "Not working"
}

const DayHeader = ({
  specialist,
  day,
  count
}: {
  readonly specialist: Specialist
  readonly day: string
  readonly count: number
}) => (
  <div className="flex items-center gap-2.5 px-4 py-3">
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: specialist.color }}
    >
      {initials(specialist.name)}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold">{specialist.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {specialist.title === "" ? "" : `${specialist.title} · `}
        {hoursText(specialist, day)}
      </span>
    </span>
    <span className="text-xs font-medium text-muted-foreground">{count}</span>
  </div>
)

const WeekHeader = ({
  specialist,
  day,
  isToday,
  count
}: {
  readonly specialist: Specialist
  readonly day: string
  readonly isToday: boolean
  readonly count: number
}) => {
  const off = specialist.timeOff.some((item) => item.from <= day && day <= item.to)
  const closed = !specialist.hours[weekdayOf(day)]?.open
  return (
    <div className={`flex items-baseline gap-1.5 px-3 py-3 ${isToday ? "bg-muted/30" : ""}`}>
      <span className={`text-xs ${isToday ? "font-semibold" : "text-muted-foreground"}`}>{weekdayName(day)}</span>
      {isToday ? (
        <span className="flex h-[22px] min-w-[26px] items-center justify-center rounded-full bg-[#E5484D] px-1.5 text-sm font-bold text-white">
          {dayNumber(day)}
        </span>
      ) : (
        <span className={`text-lg font-semibold ${closed ? "text-muted-foreground" : ""}`}>{dayNumber(day)}</span>
      )}
      <span className="flex-1" />
      <span className={`text-[11px] ${off ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
        {off ? "Day off" : closed ? "Closed" : count}
      </span>
    </div>
  )
}

/** Turned off: what the calendar is, and where to turn it on. */
const CalendarOffNotice = ({ onTurnOn }: { readonly onTurnOn: () => void }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
    <CalendarPlus className="size-8" />
    <span className="text-xl font-bold">The calendar is off</span>
    <span className="max-w-[420px] text-sm text-muted-foreground">
      Turn it on if your business works by appointment. Then you and your AI employees book in one place.
    </span>
    <Button onClick={onTurnOn}>Turn on</Button>
  </div>
)

const SetupSteps = ({ onAdd }: { readonly onAdd: () => void }) => (
  <div className="flex flex-1 justify-center overflow-y-auto">
    <div className="flex w-[560px] flex-col gap-6 pt-[72px]">
      <div className="flex flex-col gap-3.5">
        <span className="flex size-14 items-center justify-center rounded-card bg-muted">
          <CalendarPlus className="size-6" />
        </span>
        <h2 className="text-[28px] leading-[34px] font-bold tracking-tight">Set up your calendar</h2>
        <p className="text-[15px] text-muted-foreground">
          Four short steps. Then your team books in one place, and AI employees offer only times that are really free.
        </p>
      </div>
      <ol className="flex flex-col rounded-card border">
        {[
          ["Add who takes appointments", "People from your team, or a room or place"],
          ["Set their working hours", "Each day, with breaks and days off"],
          ["Say how long each service takes", "In Services, so free times can be counted"],
          ["Choose what AI employees may do", "In each employee's settings. By default they ask first"]
        ].map(([title, hint], index) => (
          <li key={title} className="flex items-center gap-3.5 border-b px-4 py-3.5 last:border-b-0">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                index === 0 ? "bg-foreground text-background" : "border-[1.5px] text-muted-foreground"
              }`}
            >
              {index + 1}
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </span>
            {index === 0 && (
              <Button size="sm" onClick={onAdd}>
                Add
              </Button>
            )}
          </li>
        ))}
      </ol>
    </div>
  </div>
)

/** Appointments of the days shown, loaded again now and then so bookings from chats show up. */
const useShownAppointments = (enabled: boolean, firstDay: string, days: number, zone: string) => {
  const [appointments, setAppointments] = useState<ReadonlyArray<Appointment>>([])
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) return
    const range = dayRange(firstDay, days, zone)
    const result = await window.scopeBot.listAppointments(range.from, range.to)
    if (result.ok) {
      setAppointments(result.value)
      setError(null)
    } else setError(errorMessage(result.error))
    setNow(Date.now())
  }, [enabled, firstDay, days, zone])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  return { appointments, now, error, setError, load }
}

interface ColumnInput {
  readonly week: boolean
  readonly firstDay: string
  readonly day: string
  readonly todayDay: string
  readonly zone: string
  readonly visible: ReadonlyArray<Specialist>
  readonly weekSpecialist: Specialist | null
  readonly live: ReadonlyArray<Appointment>
}

const countOf = (live: ReadonlyArray<Appointment>, specialistId: string) =>
  live.filter((item) => item.specialistId === specialistId).length

/** A column per specialist for a day, or a column per day for one specialist. */
const columnsOf = (input: ColumnInput): ReadonlyArray<GridColumn> => {
  const { week, firstDay, day, todayDay, zone, visible, weekSpecialist, live } = input
  if (!week) {
    return visible.map((specialist) => ({
      key: specialist.id,
      day,
      specialist,
      today: day === todayDay,
      header: <DayHeader specialist={specialist} day={day} count={countOf(live, specialist.id)} />
    }))
  }
  if (weekSpecialist === null) return []
  return Array.from({ length: 7 }, (_, index) => {
    const columnDay = addDays(firstDay, index)
    const count = live.filter(
      (item) => item.specialistId === weekSpecialist.id && dayOf(new Date(item.startsAt), zone) === columnDay
    ).length
    return {
      key: columnDay,
      day: columnDay,
      specialist: weekSpecialist,
      today: columnDay === todayDay,
      header: <WeekHeader specialist={weekSpecialist} day={columnDay} isToday={columnDay === todayDay} count={count} />
    }
  })
}

/** The big title and the line under it. */
const headlineOf = (input: ColumnInput) => {
  const { week, firstDay, day, visible, weekSpecialist, live } = input
  const lastDay = addDays(firstDay, 6)
  if (week) {
    const title =
      firstDay.slice(0, 7) === lastDay.slice(0, 7)
        ? `${dayNumber(firstDay)} – ${dayNumber(lastDay)} ${monthName(lastDay)}`
        : `${shortDay(firstDay)} – ${shortDay(lastDay)}`
    const own = live.filter((item) => item.specialistId === weekSpecialist?.id).length
    return { title, subtitle: `${weekSpecialist?.name ?? ""} · ${own} appointments` }
  }
  const pending = live.filter((item) => item.status === "pending").length
  const held = live.filter((item) => item.status === "held").length
  const subtitle = [
    `${live.length} appointments`,
    `${visible.length} ${visible.length === 1 ? "specialist" : "specialists"}`,
    pending > 0 ? `${pending} waits for your OK` : "",
    held > 0 ? `${held} held for a chat` : ""
  ]
    .filter((part) => part !== "")
    .join(" · ")
  return { title: longDay(day), subtitle }
}

const CalendarTitleBar = ({
  enabled,
  tab,
  waiting,
  own = false,
  onTab
}: {
  readonly enabled: boolean
  readonly tab: CalendarTab
  readonly waiting: number
  /** A specialist sees their own day and week, without approvals and settings. */
  readonly own?: boolean
  readonly onTab: (tab: CalendarTab) => void
}) => (
  <TitleBar>
    <span className="text-sm font-semibold">Calendar</span>
    {enabled && (
      <div className="flex items-center gap-0.5 pl-2">
        <Tab active={tab === "day"} onSelect={() => onTab("day")}>
          Day
        </Tab>
        <Tab active={tab === "week"} onSelect={() => onTab("week")}>
          Week
        </Tab>
        {!own && (
          <>
            <Tab active={tab === "waiting"} onSelect={() => onTab("waiting")}>
              Waiting for your OK
              {waiting > 0 && <span className="pl-1.5 text-amber-500">{waiting}</span>}
            </Tab>
            <Tab active={tab === "settings"} onSelect={() => onTab("settings")}>
              Settings
            </Tab>
          </>
        )}
      </div>
    )}
  </TitleBar>
)

const Toolbar = ({
  title,
  subtitle,
  week,
  onStep,
  onToday,
  onNew
}: {
  readonly title: string
  readonly subtitle: string
  readonly week: boolean
  readonly onStep: (direction: number) => void
  readonly onToday: () => void
  readonly onNew: () => void
}) => (
  <div className="flex shrink-0 items-center gap-4 border-b px-6 pt-[18px] pb-4">
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
    </div>
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous"
        onClick={() => onStep(-1)}
        className="flex size-8 items-center justify-center rounded-control-sm border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={onToday}
        className="h-8 rounded-control-sm border px-3 text-[13px] font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {week ? "This week" : "Today"}
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={() => onStep(1)}
        className="flex size-8 items-center justify-center rounded-control-sm border outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
    <Button onClick={onNew}>
      <Plus className="size-4" />
      New appointment
    </Button>
  </div>
)

const WaitingPage = ({
  agents,
  onMove,
  onDecline,
  onChanged
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly onMove: (appointment: Appointment) => void
  readonly onDecline: (appointment: Appointment) => void
  readonly onChanged: () => void
}) => (
  <>
    <div className="flex shrink-0 flex-col gap-0.5 border-b px-6 pt-[18px] pb-4">
      <h1 className="text-2xl font-bold tracking-tight">Waiting for your OK</h1>
      <p className="text-[13px] text-muted-foreground">
        AI employees asked before booking. Each time is held for the client until you answer.
      </p>
    </div>
    <CalendarWaiting agents={agents} onMove={onMove} onDecline={onDecline} onChanged={onChanged} />
  </>
)

/** Which specialists are shown: a set to hide on the day view, one specialist on the week view. */
const useShownSpecialists = (specialists: ReadonlyArray<Specialist>, week: boolean) => {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [weekOf, setWeekOf] = useState<string | null>(null)
  const visible = specialists.filter((item) => !hidden.has(item.id))
  const weekSpecialist = specialists.find((item) => item.id === weekOf) ?? visible[0] ?? specialists[0] ?? null
  const sidebarHidden =
    week && weekSpecialist !== null
      ? new Set(specialists.filter((item) => item.id !== weekSpecialist.id).map((item) => item.id))
      : hidden
  const toggle = (id: string) => {
    if (week) {
      setWeekOf(id)
      return
    }
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  return { visible, weekSpecialist, sidebarHidden, toggle }
}

const CalendarBody = ({
  tab,
  agents,
  hasSpecialists,
  toolbar,
  grid,
  onSettings,
  onMove,
  onDecline,
  onChanged
}: {
  readonly tab: CalendarTab
  readonly agents: ReadonlyArray<Agent>
  readonly hasSpecialists: boolean
  readonly toolbar: ReactNode
  readonly grid: ReactNode
  readonly onSettings: () => void
  readonly onMove: (appointment: Appointment) => void
  readonly onDecline: (appointment: Appointment) => void
  readonly onChanged: () => void
}) => {
  if (tab === "settings") return <CalendarSettingsView agents={agents} />
  if (tab === "waiting") {
    return <WaitingPage agents={agents} onMove={onMove} onDecline={onDecline} onChanged={onChanged} />
  }
  if (!hasSpecialists) return <SetupSteps onAdd={onSettings} />
  return (
    <>
      {toolbar}
      {grid}
    </>
  )
}

/** A member who takes appointments sees only their own column, as the server shows them only their own. */
const ownView = (account: Account, all: ReadonlyArray<Specialist>) => {
  const own = account.user.role === "member" ? all.find((item) => item.userId === account.user.id) : undefined
  return { own, specialists: own === undefined ? all : [own] }
}

/** The grid, with the specialist's next client beside it on their own day. */
const WithMyDay = ({
  shown,
  grid,
  ...panel
}: { readonly shown: boolean; readonly grid: ReactNode } & Parameters<typeof MyDayPanel>[0]) =>
  shown ? (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">{grid}</div>
      <MyDayPanel {...panel} />
    </div>
  ) : (
    grid
  )

/** A specialist's own day: the title says so, and they see only their own clients. */
const ownHeadline = (own: Specialist, day: string, live: ReadonlyArray<Appointment>) => {
  const count = live.filter((item) => item.specialistId === own.id).length
  return {
    title: `Your day, ${longDay(day).replace(",", "")}`,
    subtitle: `Signed in as ${own.name} · ${count} ${count === 1 ? "appointment" : "appointments"} · you see only your own clients`
  }
}

/**
 * The calendar of the business: a day of every specialist, a week of one, what
 * waits for an OK, and settings. A member who is a specialist sees their own day.
 */
export const CalendarScreen = ({
  agents,
  account,
  day: openOn = null,
  onAsk
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly account: Account
  /** The day to open on, as a card in a chat asks. Today otherwise. */
  readonly day?: string | null
  readonly onAsk: (agentId: string, question: string) => void
}) => {
  const calendar = useCalendar()
  const { settings, waiting } = calendar
  const { own, specialists } = ownView(account, calendar.specialists)
  const { contacts, services, reload: reloadCrm } = useCrm()
  const zone = settings.timeZone
  const [tab, setTab] = useState<CalendarTab>("day")
  const [day, setDay] = useState(() => openOn ?? today(zone))
  const [search, setSearch] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState<Appointment | null>(null)

  const week = tab === "week"
  const firstDay = week ? weekStart(day) : day
  const days = week ? 7 : 1
  const shown = useShownAppointments(settings.enabled, firstDay, days, zone)
  const { visible, weekSpecialist, sidebarHidden, toggle } = useShownSpecialists(specialists, week)
  const todayDay = dayOf(new Date(shown.now), zone)

  const refresh = () => {
    void shown.load()
    void calendar.reloadWaiting()
    void reloadCrm()
  }
  const { load, setError } = shown
  const { reloadWaiting } = calendar
  const afterDrop = useCallback(async () => {
    await load()
    setError(null)
    await reloadWaiting()
  }, [load, setError, reloadWaiting])
  const dropMove = useDropMove(zone, afterDrop)
  const failedMove = dropMove.failed

  const textOf = useCallback(
    (appointment: Appointment) => ({
      name: contacts.find((item) => item.id === appointment.contactId)?.name ?? "No client",
      service: services.find((item) => item.id === appointment.serviceId)?.name ?? ""
    }),
    [contacts, services]
  )

  const query = search.trim().toLowerCase()
  const matching = useMemo(
    () =>
      shown.appointments.filter((item) => {
        const text = textOf(item)
        return query === "" || `${text.name} ${text.service}`.toLowerCase().includes(query)
      }),
    [shown.appointments, query, textOf]
  )
  const live = matching.filter((item) => isLive(item, shown.now) && item.status !== "cancelled")
  const input: ColumnInput = { week, firstDay, day, todayDay, zone, visible, weekSpecialist, live }
  const { title, subtitle } = own !== undefined && !week ? ownHeadline(own, day, live) : headlineOf(input)
  const counts = new Map(specialists.map((item) => [item.id, countOf(live, item.id)]))
  const open = shown.appointments.find((item) => item.id === openId) ?? waiting.find((item) => item.id === openId)

  if (!settings.enabled) {
    return (
      <>
        <CalendarTitleBar enabled={false} tab={tab} waiting={0} onTab={setTab} />
        <CalendarOffNotice
          onTurnOn={() => {
            void calendar.saveSettings({ ...settings, enabled: true }).then((result) => {
              if (!result.ok) shown.setError(errorMessage(result.error))
            })
          }}
        />
        {shown.error !== null && <p className="pb-6 text-center text-sm text-destructive">{shown.error}</p>}
      </>
    )
  }

  const toolbar = (
    <>
      <Toolbar
        title={title}
        subtitle={subtitle}
        week={week}
        onStep={(direction) => setDay(addDays(day, direction * days))}
        onToday={() => setDay(todayDay)}
        onNew={() => setBooking({ mode: "new", day, specialistId: week ? (weekSpecialist?.id ?? null) : null })}
      />
      {shown.error !== null && <p className="px-6 pt-3 text-sm text-destructive">{shown.error}</p>}
    </>
  )

  const calendarGrid = (
    <CalendarGrid
      columns={columnsOf(input)}
      appointmentsOf={(column) =>
        matching.filter(
          (item) => item.specialistId === column.specialist.id && dayOf(new Date(item.startsAt), zone) === column.day
        )
      }
      textOf={textOf}
      agents={agents}
      timeZone={zone}
      hours={gridHours(week && weekSpecialist !== null ? [weekSpecialist] : visible)}
      now={shown.now}
      compact={week}
      selectedId={openId}
      bufferMinutes={settings.bufferMinutes}
      onOpen={(appointment) => setOpenId(appointment.id)}
      onMove={dropMove.move}
    />
  )

  const grid = (
    <WithMyDay
      shown={own !== undefined && !week}
      grid={calendarGrid}
      appointments={live.filter((item) => dayOf(new Date(item.startsAt), zone) === day)}
      today={day === todayDay}
      now={shown.now}
      agents={agents}
      onOpen={(appointment) => setOpenId(appointment.id)}
      onAsk={onAsk}
    />
  )

  return (
    <>
      <CalendarTitleBar enabled tab={tab} waiting={waiting.length} own={own !== undefined} onTab={setTab} />
      <div className="flex min-h-0 flex-1">
        {tab !== "settings" && (
          <CalendarSidebar
            day={day}
            today={todayDay}
            week={week}
            specialists={specialists}
            counts={counts}
            hidden={sidebarHidden}
            search={search}
            onSearch={setSearch}
            onSelectDay={(next) => {
              setDay(next)
              if (tab === "waiting") setTab("day")
            }}
            onToggle={toggle}
            {...(own === undefined ? {} : { title: "YOUR CALENDAR" })}
          />
        )}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <CalendarBody
            tab={tab}
            agents={agents}
            hasSpecialists={specialists.length > 0}
            toolbar={toolbar}
            grid={grid}
            onSettings={() => setTab("settings")}
            onMove={(appointment) => setBooking({ mode: "move", appointment })}
            onDecline={setCancelling}
            onChanged={refresh}
          />
          {open !== undefined && tab !== "settings" && (
            <AppointmentPanel
              key={open.id}
              appointment={open}
              specialist={specialists.find((item) => item.id === open.specialistId)}
              settings={settings}
              agents={agents}
              onClose={() => setOpenId(null)}
              onMove={() => setBooking({ mode: "move", appointment: open })}
              onCancel={() => setCancelling(open)}
              onChanged={refresh}
            />
          )}
          {failedMove !== null && (
            <MoveNotice
              failed={failedMove}
              appointments={shown.appointments}
              agents={agents}
              clientName={textOf(failedMove.appointment).name}
              timeZone={zone}
              onOtherTimes={() => {
                setBooking({ mode: "move", appointment: failedMove.appointment })
                dropMove.dismiss()
              }}
              onClose={dropMove.dismiss}
            />
          )}
        </div>
      </div>
      <BookingModal
        booking={booking}
        onClose={() => setBooking(null)}
        onDone={(appointment) => {
          setBooking(null)
          setOpenId(appointment.id)
          setDay(dayOf(new Date(appointment.startsAt), zone))
          refresh()
        }}
      />
      <CancelModal
        appointment={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => {
          setCancelling(null)
          refresh()
        }}
      />
    </>
  )
}
