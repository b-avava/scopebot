import { addDays, type Specialist } from "@scope-bot/domain"
import { Check, ChevronLeft, ChevronRight, Clock, Search, X } from "lucide-react"
import { useState } from "react"
import { dayNumber, monthName, weekStart } from "./calendarView.ts"

const headers = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

/** How a day in the small month reads: chosen, today, outside the month, or a Sunday. */
const dayTone = (
  day: string,
  at: { readonly selected: string; readonly today: string; readonly month: string; readonly weekend: boolean }
) => {
  if (day === at.selected) return "bg-foreground font-bold text-background"
  if (day === at.today) return "font-bold text-[#E5484D]"
  if (day.slice(0, 7) !== at.month.slice(0, 7)) return "text-muted-foreground/60"
  return at.weekend ? "text-muted-foreground" : ""
}

const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`

const MiniMonth = ({
  selected,
  today,
  week,
  onSelect
}: {
  readonly selected: string
  readonly today: string
  /** Whether the whole week of the selected day is shown. */
  readonly week: boolean
  readonly onSelect: (day: string) => void
}) => {
  const [month, setMonth] = useState(firstOfMonth(selected))
  const start = weekStart(month)
  const rows = Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => addDays(start, row * 7 + col))
  )
  const selectedWeek = weekStart(selected)
  const shift = (count: number) => {
    const [year = 2026, value = 1] = month.split("-").map(Number)
    const next = new Date(Date.UTC(year, value - 1 + count, 1))
    setMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`)
  }

  return (
    <div className="flex flex-col gap-1.5 px-1 pt-4 pb-2">
      <div className="flex items-center px-1.5 pb-1.5">
        <span className="flex-1 text-sm font-semibold">
          {monthName(month)} {month.slice(0, 4)}
        </span>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div className="flex">
        {headers.map((name) => (
          <span key={name} className="flex-1 text-center text-[11px] text-muted-foreground">
            {name}
          </span>
        ))}
      </div>
      {rows.map((days) => (
        <div key={days[0]} className={`flex rounded-control-sm ${week && days[0] === selectedWeek ? "bg-muted" : ""}`}>
          {days.map((day, index) => (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              className="flex h-8 flex-1 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full text-xs ${dayTone(day, { selected, today, month, weekend: index >= 6 })}`}
              >
                {dayNumber(day)}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

const legend = [
  {
    label: "Confirmed",
    mark: (
      <span className="flex size-[18px] items-center justify-center rounded-full bg-[#3CBF6E]/15">
        <Check className="size-2.5 text-[#3CBF6E]" strokeWidth={3.5} />
      </span>
    )
  },
  {
    label: "Not confirmed yet",
    mark: (
      <span className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-muted-foreground">
        <span className="size-1 rounded-full bg-muted-foreground" />
      </span>
    )
  },
  {
    label: "Waits for your OK or held",
    mark: (
      <span className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-dashed border-amber-400">
        <Clock className="size-2.5 text-amber-500" strokeWidth={3} />
      </span>
    )
  },
  {
    label: "Didn't come",
    mark: (
      <span className="flex size-[18px] items-center justify-center rounded-full bg-[#E5484D]/15">
        <X className="size-2.5 text-[#E5484D]" strokeWidth={3.5} />
      </span>
    )
  },
  {
    label: "Came, done",
    mark: (
      <span className="flex size-[18px] items-center justify-center rounded-full bg-muted">
        <Check className="size-2.5 text-muted-foreground" strokeWidth={3.5} />
      </span>
    )
  }
]

/** The calendar's own side panel: a month to jump around in, who to show, and what the colours mean. */
export const CalendarSidebar = ({
  day,
  today,
  week,
  specialists,
  counts,
  hidden,
  search,
  onSearch,
  onSelectDay,
  onToggle,
  title
}: {
  readonly day: string
  readonly today: string
  readonly week: boolean
  readonly specialists: ReadonlyArray<Specialist>
  readonly counts: ReadonlyMap<string, number>
  readonly hidden: ReadonlySet<string>
  readonly search: string
  readonly onSearch: (text: string) => void
  readonly onSelectDay: (day: string) => void
  readonly onToggle: (id: string) => void
  /** Instead of the usual heading, for a specialist who sees only their own calendar. */
  readonly title?: string
}) => (
  <aside className="flex w-[300px] shrink-0 flex-col gap-1 overflow-y-auto border-r p-3">
    <label className="flex h-9 shrink-0 items-center gap-2 rounded-control border bg-field px-3 focus-within:ring-2 focus-within:ring-ring">
      <Search className="size-4 text-muted-foreground" />
      <input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Find a client or appointment"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </label>
    <MiniMonth key={day.slice(0, 7)} selected={day} today={today} week={week} onSelect={onSelectDay} />
    <div className="flex flex-col gap-0.5 border-t pt-3">
      <span className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">
        {title ?? (week ? "SPECIALIST" : "SPECIALISTS")}
      </span>
      {specialists.length === 0 && (
        <span className="px-2.5 text-[13px] text-muted-foreground">Nobody takes appointments yet</span>
      )}
      {specialists.map((specialist) => {
        const shown = !hidden.has(specialist.id)
        return (
          <button
            key={specialist.id}
            type="button"
            onClick={() => onToggle(specialist.id)}
            className="flex h-9 items-center gap-2.5 rounded-control-sm px-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={`flex size-4 items-center justify-center rounded-[5px] ${shown ? "" : "border-[1.5px] border-muted-foreground"}`}
              style={shown ? { background: specialist.color } : undefined}
            >
              {shown && <Check className="size-2.5 text-white" strokeWidth={3.5} />}
            </span>
            <span className={`flex-1 truncate text-[13px] font-medium ${shown ? "" : "text-muted-foreground"}`}>
              {specialist.name}
            </span>
            <span className="text-xs text-muted-foreground">{counts.get(specialist.id) ?? 0}</span>
          </button>
        )
      })}
    </div>
    <div className="mt-2 flex flex-col gap-2 border-t px-2.5 pt-3.5">
      <span className="pb-0.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">STATUS</span>
      {legend.map((item) => (
        <span key={item.label} className="flex items-center gap-2.5 text-xs">
          {item.mark}
          {item.label}
        </span>
      ))}
    </div>
  </aside>
)
