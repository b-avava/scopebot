import type { Activity, Agent, ApprovalRequest, Contact, NewActivity } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Search, SendHorizontal, Trash2, X } from "lucide-react"
import { type ReactNode, useState } from "react"
import { EmployeeAvatar } from "./Avatar.tsx"
import { useCrm } from "./CrmContext.tsx"
import { dayLabel, groupByDay, timeLabel } from "./crmStats.ts"
import { errorMessage } from "./hooks.ts"

/** A field that takes its width from the caller. */
export const fieldBase =
  "h-9 rounded-control-sm border bg-field px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

export const fieldClasses = `${fieldBase} w-full`

export const SearchField = ({
  value,
  placeholder,
  onChange
}: {
  readonly value: string
  readonly placeholder: string
  readonly onChange: (value: string) => void
}) => (
  <label className="flex h-8 w-64 shrink-0 items-center gap-2 rounded-control-sm border bg-field px-2.5 focus-within:ring-2 focus-within:ring-ring">
    <Search className="size-3.5 shrink-0 text-muted-foreground" />
    <input
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
    />
  </label>
)

export interface Option {
  readonly value: string
  readonly label: string
}

/** A filter that reads like "Owner Everyone". */
export const FilterSelect = ({
  label,
  value,
  options,
  onChange
}: {
  readonly label: string
  readonly value: string
  readonly options: ReadonlyArray<Option>
  readonly onChange: (value: string) => void
}) => (
  <label className="flex h-8 shrink-0 items-center gap-1 rounded-control-sm border px-2.5 text-[13px] text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
    {label}
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="max-w-36 cursor-pointer appearance-none bg-transparent font-medium text-foreground outline-none [field-sizing:content]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
)

export const Tab = ({
  active,
  children,
  onSelect
}: {
  readonly active: boolean
  readonly children: ReactNode
  readonly onSelect: () => void
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onSelect}
    className={`window-no-drag h-7 shrink-0 rounded-control-sm px-2.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    {children}
  </button>
)

/** The amber pill for things that wait for a person. */
export const AttentionPill = ({
  children,
  onClick
}: {
  readonly children: ReactNode
  readonly onClick?: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={onClick === undefined}
    className="flex h-8 shrink-0 items-center gap-2 rounded-control-sm bg-amber-400/15 px-3 text-[13px] font-medium text-amber-600 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
  >
    <span className="size-1.5 rounded-full bg-current" />
    {children}
  </button>
)

const avatarColors = ["#3B8BEB", "#14A38B", "#7A5AF8", "#E0653A", "#C2417C", "#5C7A29"]

/** The same contact always gets the same color. */
const avatarColor = (name: string) =>
  avatarColors[[...name].reduce((sum, letter) => sum + (letter.codePointAt(0) ?? 0), 0) % avatarColors.length]

export const ContactAvatar = ({ contact, size = 36 }: { readonly contact: Contact; readonly size?: number }) => (
  <span
    style={{ width: size, height: size, fontSize: Math.round(size * 0.36), backgroundColor: avatarColor(contact.name) }}
    className={`flex shrink-0 items-center justify-center font-semibold text-white ${
      contact.kind === "company" ? "rounded-[28%]" : "rounded-full"
    }`}
  >
    {contact.name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("")}
  </span>
)

export const OwnerBadge = ({ agent, size = 18 }: { readonly agent: Agent | undefined; readonly size?: number }) =>
  agent === undefined ? (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-semibold"
    >
      You
    </span>
  ) : (
    <EmployeeAvatar agent={agent} size={size} />
  )

export const ownerOptions = (agents: ReadonlyArray<Agent>): ReadonlyArray<Option> => [
  { value: "you", label: "You" },
  ...agents.map((agent) => ({ value: agent.id, label: agent.name }))
]

export const Stat = ({ value, label }: { readonly value: string; readonly label: string }) => (
  <span className="whitespace-nowrap text-[13px] text-muted-foreground">
    <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span> {label}
  </span>
)

export const ApprovalCard = ({ approval }: { readonly approval: ApprovalRequest }) => {
  const { agents, decideApproval } = useCrm()
  const [error, setError] = useState<string | null>(null)
  const agent = agents.find((item) => item.id === approval.agentId)

  const decide = async (status: "approved" | "declined") => {
    const result = await decideApproval(approval.id, { status })
    setError(result.ok ? null : errorMessage(result.error))
  }

  return (
    <section
      aria-label="Needs your OK"
      className="flex flex-col gap-3 rounded-card border border-amber-400 bg-amber-400/5 px-4 py-3.5"
    >
      <div className="flex items-center gap-3">
        <OwnerBadge agent={agent} size={32} />
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">{agent?.name ?? "An employee"} needs your OK</p>
          <p className="text-base font-semibold">{approval.title}</p>
        </div>
      </div>
      {approval.reason !== "" && <p className="text-sm leading-5">{approval.reason}</p>}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void decide("approved")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => void decide("declined")}>
          Decline
        </Button>
      </div>
    </section>
  )
}

const authorName = (activity: Activity, agents: ReadonlyArray<Agent>) =>
  agents.find((agent) => agent.id === activity.agentId)?.name ?? null

const kindLabel = { note: "Note", task: "Task", event: "" } as const

/** What happened, newest first. */
export const Timeline = ({ items, empty }: { readonly items: ReadonlyArray<Activity>; readonly empty: string }) => {
  const { agents } = useCrm()

  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>

  return (
    <div className="flex flex-col gap-4">
      {groupByDay(items, new Date()).map(([day, entries]) => (
        <section key={day} aria-label={day} className="flex flex-col gap-3">
          <h3 className="text-[13px] font-medium text-muted-foreground">{day}</h3>
          {entries.map((item) => (
            <div key={item.id} className="flex gap-3">
              <time dateTime={item.createdAt} className="w-11 shrink-0 text-[13px] leading-5 text-muted-foreground">
                {timeLabel(item.createdAt)}
              </time>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-5 [overflow-wrap:anywhere]">{item.text}</p>
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {[kindLabel[item.kind], authorName(item, agents)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

export const Tick = ({
  checked,
  label,
  onChange
}: {
  readonly checked: boolean
  readonly label: string
  readonly onChange: () => void
}) => (
  <input
    type="checkbox"
    aria-label={label}
    checked={checked}
    onChange={onChange}
    onClick={(event) => event.stopPropagation()}
    className="size-4 shrink-0 cursor-pointer accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
  />
)

export const TaskList = ({ tasks, empty }: { readonly tasks: ReadonlyArray<Activity>; readonly empty: string }) => {
  const { agents, patchActivity, removeActivity } = useCrm()

  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>

  const sorted = [...tasks].sort((first, second) => Number(first.done) - Number(second.done))
  return (
    <ul className="flex flex-col gap-1">
      {sorted.map((task) => (
        <li key={task.id} className="group flex items-center gap-2.5 py-1">
          <Tick
            checked={task.done}
            label={`Done: ${task.text}`}
            onChange={() => void patchActivity(task.id, { done: !task.done })}
          />
          <span className={`min-w-0 flex-1 text-sm ${task.done ? "text-muted-foreground line-through" : ""}`}>
            {task.text}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {[authorName(task, agents), dayLabel(task.dueAt)].filter(Boolean).join(", ")}
          </span>
          <button
            type="button"
            aria-label={`Delete: ${task.text}`}
            onClick={() => void removeActivity(task.id)}
            className="shrink-0 text-muted-foreground opacity-0 outline-none transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Adds a note or a task to a contact or a deal. */
export const Composer = ({
  links,
  placeholder
}: {
  readonly links: Pick<NewActivity, "contactId" | "dealId">
  readonly placeholder: string
}) => {
  const { addActivity } = useCrm()
  const [kind, setKind] = useState<"note" | "task">("note")
  const [text, setText] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (text.trim() === "") return
    const result = await addActivity({
      ...links,
      kind,
      text: text.trim(),
      agentId: null,
      dueAt: kind === "task" && dueAt !== "" ? dueAt : null
    })
    setError(result.ok ? null : errorMessage(result.error))
    if (result.ok) {
      setText("")
      setDueAt("")
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-card border bg-field p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex items-center gap-1">
        <Tab active={kind === "note"} onSelect={() => setKind("note")}>
          Note
        </Tab>
        <Tab active={kind === "task"} onSelect={() => setKind("task")}>
          Task
        </Tab>
      </div>
      <div className="flex items-center gap-2">
        <input
          aria-label={kind === "note" ? "Note" : "Task"}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={kind === "note" ? placeholder : "What needs doing?"}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {kind === "task" && (
          <input
            type="date"
            aria-label="Due date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="bg-transparent text-[13px] text-muted-foreground outline-none"
          />
        )}
        <button
          type="submit"
          aria-label="Add"
          disabled={text.trim() === ""}
          className="flex size-8 shrink-0 items-center justify-center rounded-control-sm bg-primary text-primary-foreground outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

export const PanelClose = ({ onClose }: { readonly onClose: () => void }) => (
  <button
    type="button"
    aria-label="Close"
    onClick={onClose}
    className="text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
  >
    <X className="size-4" />
  </button>
)

/** Downloads text as a file, through the browser engine, so main needs no new permissions. */
export const saveFile = (name: string, content: string) => {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
