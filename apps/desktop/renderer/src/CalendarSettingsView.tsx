import {
  type Agent,
  type CalendarSettings,
  type DayHours,
  defaultWeekHours,
  type Reminder,
  type Specialist,
  type SpecialistDetails,
  type StageRules,
  type User
} from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { Plus, Trash2 } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { initials, specialistColors } from "./calendarView.ts"
import { errorMessage } from "./hooks.ts"

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const fieldClasses =
  "h-9 rounded-control-sm border bg-field px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
const sectionTitle = "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground"

type Page = { readonly kind: "specialist"; readonly id: string | null } | { readonly kind: "rules" }

const emptySpecialist = (index: number): SpecialistDetails => ({
  name: "",
  title: "",
  color: specialistColors[index % specialistColors.length] ?? "#2F9BCB",
  userId: null,
  active: true,
  hours: defaultWeekHours,
  serviceIds: [],
  timeOff: []
})

const toDetails = ({ id: _id, createdAt: _created, ...details }: Specialist): SpecialistDetails => details

const NavButton = ({
  active,
  onSelect,
  children
}: {
  readonly active: boolean
  readonly onSelect: () => void
  readonly children: ReactNode
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`flex h-11 items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "bg-muted font-semibold" : "font-medium hover:bg-muted"
    }`}
  >
    {children}
  </button>
)

const HoursRow = ({
  name,
  day,
  onChange
}: {
  readonly name: string
  readonly day: DayHours
  readonly onChange: (day: DayHours) => void
}) => {
  const pause = day.breaks[0]
  return (
    <div className="flex min-h-12 items-center gap-3 border-b px-4 py-1.5 last:border-b-0">
      <span className={`w-10 shrink-0 text-[13px] font-semibold ${day.open ? "" : "text-muted-foreground"}`}>
        {name}
      </span>
      <Switch
        ariaLabel={`Works on ${name}`}
        checked={day.open}
        onCheckedChange={(open) => onChange({ ...day, open })}
      />
      {day.open ? (
        <>
          <input
            type="time"
            aria-label={`${name} from`}
            value={day.from}
            onChange={(event) => onChange({ ...day, from: event.target.value })}
            className={fieldClasses}
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="time"
            aria-label={`${name} to`}
            value={day.to}
            onChange={(event) => onChange({ ...day, to: event.target.value })}
            className={fieldClasses}
          />
          {pause === undefined ? (
            <button
              type="button"
              onClick={() => onChange({ ...day, breaks: [{ from: "13:00", to: "14:00" }] })}
              className="ml-auto rounded-sm text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Add a break
            </button>
          ) : (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              Break
              <input
                type="time"
                aria-label={`${name} break from`}
                value={pause.from}
                onChange={(event) => onChange({ ...day, breaks: [{ ...pause, from: event.target.value }] })}
                className={fieldClasses}
              />
              <input
                type="time"
                aria-label={`${name} break to`}
                value={pause.to}
                onChange={(event) => onChange({ ...day, breaks: [{ ...pause, to: event.target.value }] })}
                className={fieldClasses}
              />
              <button
                type="button"
                aria-label={`Remove the break on ${name}`}
                onClick={() => onChange({ ...day, breaks: [] })}
                className="rounded-sm p-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          )}
        </>
      ) : (
        <span className="text-[13px] text-muted-foreground">Doesn't work</span>
      )}
    </div>
  )
}

/** Someone who takes appointments: their hours, what they do, days off, and who signs in as them. */
const SpecialistForm = ({
  specialist,
  index,
  team,
  onSaved,
  onRemoved
}: {
  readonly specialist: Specialist | null
  readonly index: number
  readonly team: ReadonlyArray<User>
  readonly onSaved: (specialist: Specialist) => void
  readonly onRemoved: () => void
}) => {
  const { saveSpecialist, removeSpecialist } = useCalendar()
  const { services } = useCrm()
  const [details, setDetails] = useState<SpecialistDetails>(
    specialist === null ? emptySpecialist(index) : toDetails(specialist)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offFrom, setOffFrom] = useState("")
  const [offTo, setOffTo] = useState("")
  const [offNote, setOffNote] = useState("")

  const set = (patch: Partial<SpecialistDetails>) => setDetails((current) => ({ ...current, ...patch }))

  const save = async () => {
    setBusy(true)
    const result = await saveSpecialist({ ...details, name: details.name.trim() }, specialist?.id ?? null)
    setBusy(false)
    if (result.ok) {
      setError(null)
      onSaved(result.value)
    } else setError(errorMessage(result.error))
  }

  const remove = async () => {
    if (specialist === null) return
    setBusy(true)
    const result = await removeSpecialist(specialist.id)
    setBusy(false)
    if (result.ok) onRemoved()
    else setError(errorMessage(result.error))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-6">
      <div className="flex items-center gap-3.5">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
          style={{ background: details.color }}
        >
          {initials(details.name) || "?"}
        </span>
        <div className="flex flex-1 flex-col gap-1.5">
          <input
            aria-label="Name"
            value={details.name}
            placeholder="Name"
            onChange={(event) => set({ name: event.target.value })}
            className="bg-transparent text-[22px] font-bold tracking-tight outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2">
            <input
              aria-label="Job"
              value={details.title}
              placeholder="What they do, like Dentist or Barber"
              onChange={(event) => set({ title: event.target.value })}
              className={`${fieldClasses} w-64`}
            />
            <select
              aria-label="Signs in as"
              value={details.userId ?? ""}
              onChange={(event) => set({ userId: team.find((user) => user.id === event.target.value)?.id ?? null })}
              className={fieldClasses}
            >
              <option value="">Doesn't sign in</option>
              {team.map((user) => (
                <option key={user.id} value={user.id}>
                  Signs in as {user.email}
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              {specialistColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Colour ${color}`}
                  onClick={() => set({ color })}
                  className={`size-5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    details.color === color ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
                  }`}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>
        </div>
        <span className="flex items-center gap-2.5 text-[13px] font-medium">
          Takes appointments
          <Switch
            ariaLabel="Takes appointments"
            checked={details.active}
            onCheckedChange={(active) => set({ active })}
          />
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-[640px] flex-[3] flex-col rounded-card border">
          <div className="flex items-center border-b px-4 py-3.5">
            <span className="flex-1 text-[15px] font-semibold">Working hours</span>
          </div>
          {details.hours.map((day, dayIndex) => (
            <HoursRow
              key={weekdays[dayIndex]}
              name={weekdays[dayIndex] ?? ""}
              day={day}
              onChange={(next) => set({ hours: details.hours.map((item, i) => (i === dayIndex ? next : item)) })}
            />
          ))}
        </div>

        <div className="flex min-w-[320px] flex-[2] flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold">Services they do</span>
              <span className="text-[13px] text-muted-foreground">
                Only these can be booked with them, by people and by AI employees.
              </span>
            </div>
            {services.length === 0 && (
              <span className="text-[13px] text-muted-foreground">Add services first, in Services.</span>
            )}
            <div className="flex flex-wrap gap-1.5">
              {services.map((service) => {
                const chosen = details.serviceIds.includes(service.id)
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() =>
                      set({
                        serviceIds: chosen
                          ? details.serviceIds.filter((id) => id !== service.id)
                          : [...details.serviceIds, service.id]
                      })
                    }
                    className={`h-8 rounded-control-sm px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      chosen
                        ? "bg-foreground font-semibold text-background"
                        : "border font-medium text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {service.name}
                    {service.minutes === undefined ? "" : ` · ${service.minutes} min`}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">Days off and vacations</span>
            {details.timeOff.map((off, offIndex) => (
              <div
                key={`${off.from}-${off.to}-${off.note}`}
                className="flex items-center gap-3 rounded-card bg-field px-3.5 py-3"
              >
                <span className="w-40 shrink-0 text-[13px] font-semibold">
                  {off.from === off.to ? off.from : `${off.from} – ${off.to}`}
                </span>
                <span className="flex-1 text-[13px] text-muted-foreground">{off.note || "Day off"}</span>
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => set({ timeOff: details.timeOff.filter((_, i) => i !== offIndex) })}
                  className="rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Off from"
                value={offFrom}
                onChange={(event) => setOffFrom(event.target.value)}
                className={fieldClasses}
              />
              <input
                type="date"
                aria-label="Off to"
                value={offTo}
                onChange={(event) => setOffTo(event.target.value)}
                className={fieldClasses}
              />
              <input
                aria-label="Why"
                placeholder="Vacation, conference…"
                value={offNote}
                onChange={(event) => setOffNote(event.target.value)}
                className={`${fieldClasses} flex-1`}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={offFrom === ""}
                onClick={() => {
                  const to = offTo === "" || offTo < offFrom ? offFrom : offTo
                  set({ timeOff: [...details.timeOff, { from: offFrom, to, note: offNote.trim() }] })
                  setOffFrom("")
                  setOffTo("")
                  setOffNote("")
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button disabled={busy || details.name.trim() === ""} onClick={() => void save()}>
          {specialist === null ? "Add" : "Save"}
        </Button>
        {specialist !== null && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="ml-auto rounded-sm text-sm font-semibold text-destructive outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Remove {specialist.name}
          </button>
        )}
      </div>
    </div>
  )
}

const RuleRow = ({
  title,
  hint,
  children
}: {
  readonly title: string
  readonly hint?: string
  readonly children: ReactNode
}) => (
  <div className="flex min-h-[52px] items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
    <span className="flex flex-1 flex-col gap-px">
      <span className="text-sm font-medium">{title}</span>
      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
    </span>
    {children}
  </div>
)

const NumberSelect = ({
  value,
  options,
  onChange,
  label
}: {
  readonly value: number
  readonly options: ReadonlyArray<readonly [number, string]>
  readonly onChange: (value: number) => void
  readonly label: string
}) => (
  <select
    aria-label={label}
    value={value}
    onChange={(event) => onChange(Number(event.target.value))}
    className={`${fieldClasses} font-medium`}
  >
    {options.some(([option]) => option === value) ? null : <option value={value}>{value}</option>}
    {options.map(([option, text]) => (
      <option key={option} value={option}>
        {text}
      </option>
    ))}
  </select>
)

const ruleEvents: ReadonlyArray<readonly [keyof StageRules, string]> = [
  ["booked", "An appointment is booked"],
  ["arrived", "The client came"],
  ["noShow", "The client didn't come"],
  ["allCancelled", "Every appointment is cancelled"]
]

/** Who answers the team about the schedule, and what clients hear when a person changes their appointment. */
const TeamPart = ({
  draft,
  agents,
  onChange
}: {
  readonly draft: CalendarSettings
  readonly agents: ReadonlyArray<Agent>
  readonly onChange: (patch: Partial<CalendarSettings>) => void
}) => (
  <div className="flex items-start gap-7">
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className={sectionTitle}>TEAM ASSISTANT</span>
        <span className="text-[13px] text-muted-foreground">
          Specialists ask this employee about their day, right from the calendar. It sees only what the person asking
          can see.
        </span>
      </div>
      <select
        aria-label="Team assistant"
        value={draft.assistantId ?? ""}
        onChange={(event) =>
          onChange({ assistantId: agents.find((agent) => agent.id === event.target.value)?.id ?? null })
        }
        className={`${fieldClasses} w-64 font-medium`}
      >
        <option value="">Nobody</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </div>
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className={sectionTitle}>WHEN A PERSON MOVES OR CANCELS IN A CHAT</span>
        <span className="text-[13px] text-muted-foreground">
          The client is told in their chat, with the same fields as the reminders.
        </span>
      </div>
      <textarea
        aria-label="Moved"
        value={draft.notices.moved}
        rows={2}
        onChange={(event) => onChange({ notices: { ...draft.notices, moved: event.target.value } })}
        className="resize-none rounded-control-sm border bg-field p-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <textarea
        aria-label="Cancelled"
        value={draft.notices.cancelled}
        rows={2}
        onChange={(event) => onChange({ notices: { ...draft.notices, cancelled: event.target.value } })}
        className="resize-none rounded-control-sm border bg-field p-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  </div>
)

/** Rules that hold for people and AI employees alike, the reminders, and how deals follow appointments. */
const RulesForm = ({ agents }: { readonly agents: ReadonlyArray<Agent> }) => {
  const { settings, saveSettings } = useCalendar()
  const { pipelines } = useCrm()
  const [draft, setDraft] = useState<CalendarSettings>(settings)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => setDraft(settings), [settings])

  const set = (patch: Partial<CalendarSettings>) => setDraft((current) => ({ ...current, ...patch }))
  const setReminder = (index: number, patch: Partial<Reminder>) =>
    set({ reminders: draft.reminders.map((item, i) => (i === index ? { ...item, ...patch } : item)) })
  const stages = pipelines.flatMap((pipeline) =>
    pipeline.stages.map((stage) => ({
      id: stage.id,
      label: pipelines.length > 1 ? `${pipeline.name} · ${stage.name}` : stage.name
    }))
  )

  const save = async () => {
    setBusy(true)
    const result = await saveSettings(draft)
    setBusy(false)
    setStatus(result.ok ? "Saved" : errorMessage(result.error))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-8 py-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-bold tracking-tight">Booking rules</h2>
        <p className="text-[13px] text-muted-foreground">
          The same for people and AI employees. Scope Bot checks them, not the AI.
        </p>
      </div>
      <div className="flex items-start gap-7">
        <div className="flex flex-1 flex-col rounded-card border">
          <RuleRow title="Time zone" hint="Hours and times on the calendar are in it">
            <input
              aria-label="Time zone"
              value={draft.timeZone}
              onChange={(event) => set({ timeZone: event.target.value })}
              className={`${fieldClasses} w-44`}
            />
          </RuleRow>
          <RuleRow title="Earliest booking" hint="Nobody gets a time that starts sooner">
            <NumberSelect
              label="Earliest booking"
              value={draft.minNoticeMinutes}
              onChange={(minNoticeMinutes) => set({ minNoticeMinutes })}
              options={[
                [0, "Any time"],
                [30, "30 min from now"],
                [60, "1 hour from now"],
                [120, "2 hours from now"],
                [24 * 60, "A day ahead"]
              ]}
            />
          </RuleRow>
          <RuleRow title="Book ahead up to">
            <NumberSelect
              label="Book ahead up to"
              value={draft.maxDaysAhead}
              onChange={(maxDaysAhead) => set({ maxDaysAhead })}
              options={[
                [14, "14 days"],
                [30, "30 days"],
                [60, "60 days"],
                [90, "90 days"],
                [180, "180 days"]
              ]}
            />
          </RuleRow>
          <RuleRow title="Gap after each appointment" hint="To clean up and get ready">
            <NumberSelect
              label="Gap after each appointment"
              value={draft.bufferMinutes}
              onChange={(bufferMinutes) => set({ bufferMinutes })}
              options={[
                [0, "None"],
                [5, "5 min"],
                [10, "10 min"],
                [15, "15 min"],
                [30, "30 min"]
              ]}
            />
          </RuleRow>
          <RuleRow title="Hold a time offered in a chat" hint="So nobody else takes it while the client decides">
            <NumberSelect
              label="Hold a time offered in a chat"
              value={draft.holdMinutes}
              onChange={(holdMinutes) => set({ holdMinutes })}
              options={[
                [5, "5 min"],
                [10, "10 min"],
                [15, "15 min"],
                [30, "30 min"]
              ]}
            />
          </RuleRow>
          <RuleRow title="Clients can move or cancel" hint="Later than that, the chat goes to a person">
            <NumberSelect
              label="Clients can move or cancel"
              value={draft.clientChangeHours}
              onChange={(clientChangeHours) => set({ clientChangeHours })}
              options={[
                [0, "Any time"],
                [2, "Up to 2 h before"],
                [12, "Up to 12 h before"],
                [24, "Up to 24 h before"],
                [48, "Up to 48 h before"]
              ]}
            />
          </RuleRow>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Deal stages follow appointments</span>
            <span className="text-[13px] text-muted-foreground">
              Scope Bot moves the deal, the AI doesn't decide it. A person can still move any deal by hand.
            </span>
          </div>
          <div className="flex flex-col rounded-card border">
            {ruleEvents.map(([key, label]) => (
              <RuleRow key={key} title={label}>
                <select
                  aria-label={label}
                  value={draft.stageRules[key] ?? ""}
                  onChange={(event) =>
                    set({
                      stageRules: {
                        ...draft.stageRules,
                        [key]: stages.find((stage) => stage.id === event.target.value)?.id ?? null
                      }
                    })
                  }
                  className={`${fieldClasses} w-48 font-medium`}
                >
                  <option value="">Leave the deal</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </RuleRow>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <span className={sectionTitle}>REMINDERS</span>
          <span className="text-[13px] text-muted-foreground">
            {
              "{name}, {service}, {specialist}, {date}, {time} and {address} are filled in. They go to the chat the client wrote from."
            }
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {draft.reminders.map((reminder, index) => (
            <div key={reminder.minutesBefore} className="flex flex-col gap-2.5 rounded-card bg-field px-4 py-3.5">
              <div className="flex items-center gap-2">
                <NumberSelect
                  label="When"
                  value={reminder.minutesBefore}
                  onChange={(minutesBefore) => setReminder(index, { minutesBefore })}
                  options={[
                    [60, "1 hour before"],
                    [120, "2 hours before"],
                    [24 * 60, "A day before"],
                    [48 * 60, "2 days before"]
                  ]}
                />
                <span className="flex-1" />
                <Switch
                  ariaLabel="Send this reminder"
                  checked={reminder.enabled}
                  onCheckedChange={(enabled) => setReminder(index, { enabled })}
                />
              </div>
              <textarea
                aria-label="Text"
                value={reminder.text}
                rows={3}
                onChange={(event) => setReminder(index, { text: event.target.value })}
                className="resize-none rounded-control-sm border bg-background p-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ))}
        </div>
      </div>

      <TeamPart draft={draft} agents={agents} onChange={set} />

      <div className="flex items-center gap-3">
        <Button disabled={busy} onClick={() => void save()}>
          Save rules
        </Button>
        {status !== null && <span className="text-[13px] text-muted-foreground">{status}</span>}
      </div>
    </div>
  )
}

/** Calendar settings: who takes appointments, and the rules. Owners and admins change them. */
export const CalendarSettingsView = ({ agents }: { readonly agents: ReadonlyArray<Agent> }) => {
  const { specialists } = useCalendar()
  const [page, setPage] = useState<Page>(
    specialists[0] === undefined ? { kind: "specialist", id: null } : { kind: "specialist", id: specialists[0].id }
  )
  const [team, setTeam] = useState<ReadonlyArray<User>>([])

  useEffect(() => {
    void window.scopeBot.listTeam().then((result) => {
      if (result.ok) setTeam(result.value)
    })
  }, [])

  const open = page.kind === "specialist" ? (specialists.find((item) => item.id === page.id) ?? null) : null

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-[260px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r px-3 py-5">
        <span className={`px-2.5 pb-2 ${sectionTitle}`}>WHO TAKES APPOINTMENTS</span>
        {specialists.map((specialist) => (
          <NavButton
            key={specialist.id}
            active={page.kind === "specialist" && page.id === specialist.id}
            onSelect={() => setPage({ kind: "specialist", id: specialist.id })}
          >
            <span
              className="flex size-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: specialist.color }}
            >
              {initials(specialist.name)}
            </span>
            <span className="truncate">{specialist.name}</span>
          </NavButton>
        ))}
        <NavButton
          active={page.kind === "specialist" && page.id === null}
          onSelect={() => setPage({ kind: "specialist", id: null })}
        >
          <Plus className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Add a person</span>
        </NavButton>
        <span className={`px-2.5 pt-[18px] pb-2 ${sectionTitle}`}>CALENDAR</span>
        <NavButton active={page.kind === "rules"} onSelect={() => setPage({ kind: "rules" })}>
          Booking rules, reminders, stages
        </NavButton>
      </nav>
      {page.kind === "rules" ? (
        <RulesForm agents={agents} />
      ) : (
        <SpecialistForm
          key={page.id ?? "new"}
          specialist={open}
          index={specialists.length}
          team={team}
          onSaved={(saved) => setPage({ kind: "specialist", id: saved.id })}
          onRemoved={() => setPage({ kind: "specialist", id: null })}
        />
      )}
    </div>
  )
}
