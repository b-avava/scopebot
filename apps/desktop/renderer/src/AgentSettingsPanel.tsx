import type { ActionPolicy, Agent, AgentPermissions, AgentSettings, AgentTone } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@scope-bot/ui/components/motion/select.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  Gauge,
  type LucideIcon,
  MessageCircle,
  Pencil,
  ShieldCheck,
  Siren,
  X
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { AvatarPicker } from "./AvatarPicker.tsx"
import { ConfirmChangeModal, type RiskyChange } from "./ConfirmChangeModal.tsx"
import { Mascot } from "./Mascot.tsx"
import { BackupModels, ModelField } from "./ModelSettings.tsx"
import { jobs, timeZones } from "./sampleData.ts"
import {
  backupsSummary,
  escalationSummary,
  hoursSummary,
  limitsSummary,
  permissionsSummary,
  widensPolicy
} from "./settingsSummary.ts"

const SAVE_DELAY_MS = 400

export const toSettings = ({ id: _id, pinned: _pinned, createdAt: _createdAt, ...settings }: Agent): AgentSettings =>
  settings

type Page = "main" | "look" | "backups" | "style" | "instructions" | "permissions" | "limits" | "hours" | "escalation"

const pageTitles: Record<Exclude<Page, "main">, string> = {
  look: "Look",
  backups: "Backup models",
  style: "Style",
  instructions: "Instructions",
  permissions: "Permissions",
  limits: "Limits",
  hours: "Working hours",
  escalation: "When to call a human"
}

const policies: ReadonlyArray<{ readonly value: ActionPolicy; readonly label: string }> = [
  { value: "auto", label: "On its own" },
  { value: "approve", label: "Ask first" },
  { value: "deny", label: "Never" }
]

const permissionLabels: Record<keyof AgentPermissions, string> = {
  bookAppointments: "Book appointments",
  rescheduleAppointments: "Reschedule appointments",
  cancelAppointments: "Cancel appointments",
  offerDiscounts: "Offer discounts",
  sendPaymentLinks: "Send payment links",
  sendDocuments: "Send documents"
}

const tones: ReadonlyArray<{ readonly value: AgentTone; readonly label: string }> = [
  { value: "friendly", label: "Friendly" },
  { value: "formal", label: "Formal" },
  { value: "brief", label: "Brief" }
]

const weekdays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" }
]

const labelClasses = "text-[13px] font-medium text-muted-foreground"
const hintClasses = "text-[13px] leading-[18px] text-muted-foreground"
const fieldClasses =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const textAreaClasses =
  "w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
const inputClasses = { label: "px-0 text-[13px] text-muted-foreground", field: "rounded-xl" }

const chipClasses = (selected: boolean) =>
  `rounded-full border px-3 py-1.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
    selected ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
  }`

const toNumber = (value: string, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(Number(value) || 0)))

const Group = ({ title, children }: { readonly title: string; readonly children: ReactNode }) => (
  <section className="flex flex-col gap-1.5">
    <h3 className="px-1 text-[13px] font-medium text-muted-foreground">{title}</h3>
    <div className="flex flex-col divide-y rounded-xl border">{children}</div>
  </section>
)

const Row = ({
  icon: Icon,
  label,
  value,
  onOpen
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly value?: string
  readonly onOpen: () => void
}) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-muted focus-visible:bg-muted"
  >
    <Icon className="size-4 shrink-0 text-muted-foreground" />
    <span className="shrink-0 font-medium">{label}</span>
    <span className="min-w-0 flex-1 truncate text-right text-[13px] text-muted-foreground">{value}</span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
  </button>
)

const SwitchRow = ({
  label,
  hint,
  checked,
  onChange
}: {
  readonly label: string
  readonly hint?: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}) => (
  <div className="flex items-center justify-between gap-4">
    <span className="flex flex-col">
      <span className="text-sm font-medium">{label}</span>
      {hint !== undefined && <span className={hintClasses}>{hint}</span>}
    </span>
    <Switch ariaLabel={label} checked={checked} onCheckedChange={onChange} />
  </div>
)

const PolicyRow = ({
  label,
  value,
  onChange
}: {
  readonly label: string
  readonly value: ActionPolicy
  readonly onChange: (policy: ActionPolicy) => void
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-sm">{label}</span>
    <fieldset aria-label={label} className="flex rounded-xl bg-muted p-0.5">
      {policies.map((policy) => (
        <label
          key={policy.value}
          className={`flex-1 cursor-pointer rounded-[10px] px-2 py-1.5 text-center text-[13px] font-medium transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ring ${
            policy.value === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <input
            type="radio"
            name={label}
            checked={policy.value === value}
            onChange={() => onChange(policy.value)}
            className="sr-only"
          />
          {policy.label}
        </label>
      ))}
    </fieldset>
  </div>
)

const DiscountField = ({ value, onCommit }: { readonly value: number; readonly onCommit: (value: number) => void }) => {
  const [text, setText] = useState(String(value))

  useEffect(() => setText(String(value)), [value])

  const commit = () => {
    const next = toNumber(text, 0, 100)
    setText(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClasses}>Largest discount, %</span>
      <input
        type="number"
        min={0}
        max={100}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit()
        }}
        className={fieldClasses}
      />
    </label>
  )
}

interface AgentSettingsPanelProps {
  readonly agent: Agent
  readonly onSave: (settings: AgentSettings) => Promise<string | null>
  readonly onRemove: () => void
  readonly onClose: () => void
  readonly onOpenBusiness: () => void
}

/** Settings next to the chat, so a change can be tried right away. Everything saves itself. */
export const AgentSettingsPanel = ({ agent, onSave, onRemove, onClose, onOpenBusiness }: AgentSettingsPanelProps) => {
  const [draft, setDraft] = useState(() => toSettings(agent))
  const [page, setPage] = useState<Page>("main")
  const [openSelect, setOpenSelect] = useState<"job" | "zone" | null>(null)
  const [risky, setRisky] = useState<RiskyChange | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saved = useRef(JSON.stringify(draft))
  const flush = useRef<() => void>(() => undefined)

  useEffect(() => {
    const isDirty = JSON.stringify(draft) !== saved.current && draft.name.trim() !== ""
    const persist = () => {
      saved.current = JSON.stringify(draft)
      return onSave({ ...draft, name: draft.name.trim() })
    }
    flush.current = () => {
      if (isDirty) void persist()
    }
    if (!isDirty) return
    const timer = setTimeout(() => void persist().then(setError), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, onSave])

  // Closing the panel must not lose what was typed a moment ago.
  useEffect(() => () => flush.current(), [])

  // The model can also change from the title bar while this panel is open.
  useEffect(() => {
    setDraft((current) => ({ ...current, provider: agent.provider, model: agent.model, reasoning: agent.reasoning }))
  }, [agent.provider, agent.model, agent.reasoning])

  const change = (patch: Partial<AgentSettings>) => setDraft((current) => ({ ...current, ...patch }))

  const changePolicy = (action: keyof AgentPermissions, policy: ActionPolicy) => {
    const apply = () => {
      setRisky(null)
      change({ permissions: { ...draft.permissions, [action]: policy } })
    }
    if (!widensPolicy(draft.permissions[action], policy)) return apply()
    setRisky({
      title: `Allow “${permissionLabels[action]}”?`,
      description:
        policy === "auto"
          ? `${draft.name} will do this on its own, without asking anyone.`
          : `${draft.name} will be able to do this after someone approves it.`,
      apply
    })
  }

  const changeDiscount = (maxDiscountPercent: number) => {
    const apply = () => {
      setRisky(null)
      change({ limits: { ...draft.limits, maxDiscountPercent } })
    }
    if (maxDiscountPercent <= draft.limits.maxDiscountPercent) return apply()
    setRisky({
      title: `Raise the discount limit to ${maxDiscountPercent}%?`,
      description: `${draft.name} may offer customers up to ${maxDiscountPercent}% off.`,
      apply
    })
  }

  const toggleDay = (day: number) =>
    change({
      hours: {
        ...draft.hours,
        days: draft.hours.days.includes(day)
          ? draft.hours.days.filter((value) => value !== day)
          : [...draft.hours.days, day]
      }
    })

  const jobOptions = jobs.some((job) => job === draft.job) ? jobs : [draft.job, ...jobs]

  const main = (
    <>
      <button
        type="button"
        aria-label="Change look"
        onClick={() => setPage("look")}
        className="group relative mx-auto rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Mascot size={72} shape={draft.shape} face={draft.face} color={draft.color} />
        <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground group-hover:text-foreground">
          <Pencil className="size-3" />
        </span>
      </button>

      <div className="flex flex-col gap-3">
        <Input label="Name" value={draft.name} onChange={(name) => change({ name })} classNames={inputClasses} />
        <div className={`flex flex-col gap-1.5 ${openSelect === "job" ? "relative z-20" : ""}`}>
          <span className={labelClasses}>Job</span>
          <Select
            value={draft.job}
            onValueChange={(job) => change({ job })}
            open={openSelect === "job"}
            onOpenChange={(open) => setOpenSelect(open ? "job" : null)}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jobOptions.map((job) => (
                <SelectItem key={job} value={job}>
                  {job}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SwitchRow
          label="Active"
          hint="A paused employee does not answer"
          checked={draft.active}
          onChange={(active) => change({ active })}
        />
      </div>

      <section className="flex flex-col gap-1.5">
        <h3 className="px-1 text-[13px] font-medium text-muted-foreground">Brain</h3>
        <ModelField value={draft} onChange={change} side="bottom" />
        <div className="flex flex-col divide-y rounded-xl border">
          <Row icon={Copy} label="Backup models" value={backupsSummary(draft)} onOpen={() => setPage("backups")} />
          <Row
            icon={MessageCircle}
            label="Style"
            value={tones.find((tone) => tone.value === draft.tone)?.label ?? ""}
            onOpen={() => setPage("style")}
          />
        </div>
      </section>

      <Group title="Knows">
        <Row
          icon={FileText}
          label="Instructions"
          value={draft.instructions.trim() === "" ? "Empty" : "Filled in"}
          onOpen={() => setPage("instructions")}
        />
        <Row icon={Building2} label="About the business" value="Shared by the team" onOpen={onOpenBusiness} />
      </Group>

      <Group title="Rules">
        <Row
          icon={ShieldCheck}
          label="Permissions"
          value={permissionsSummary(draft.permissions)}
          onOpen={() => setPage("permissions")}
        />
        <Row icon={Gauge} label="Limits" value={limitsSummary(draft)} onOpen={() => setPage("limits")} />
        <Row icon={Clock} label="Working hours" value={hoursSummary(draft)} onOpen={() => setPage("hours")} />
        <Row icon={Siren} label="Call a human" value={escalationSummary(draft)} onOpen={() => setPage("escalation")} />
      </Group>

      <div>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Delete employee
        </Button>
      </div>
    </>
  )

  const details: Record<Exclude<Page, "main">, ReactNode> = {
    look: (
      <>
        <div className="mx-auto">
          <Mascot size={96} shape={draft.shape} face={draft.face} color={draft.color} />
        </div>
        <AvatarPicker value={{ shape: draft.shape, face: draft.face, color: draft.color }} onChange={change} />
      </>
    ),
    backups: (
      <>
        <p className={hintClasses}>If the model cannot answer, the next backup takes over. The chat stays the same.</p>
        <BackupModels value={draft} onChange={change} />
      </>
    ),
    style: (
      <div className="flex gap-1.5">
        {tones.map((tone) => (
          <button
            key={tone.value}
            type="button"
            aria-pressed={tone.value === draft.tone}
            onClick={() => change({ tone: tone.value })}
            className={chipClasses(tone.value === draft.tone)}
          >
            {tone.label}
          </button>
        ))}
      </div>
    ),
    instructions: (
      <label className="flex flex-col gap-1.5">
        <span className={hintClasses}>Rules of the business, in your own words.</span>
        <textarea
          aria-label="Instructions"
          rows={10}
          value={draft.instructions}
          onChange={(event) => change({ instructions: event.target.value })}
          placeholder="For example: address patients formally, and recommend a check-up every six months."
          className={textAreaClasses}
        />
      </label>
    ),
    permissions: (
      <>
        <p className={hintClasses}>
          The employee only talks for now, so these act as instructions. They will be enforced in code as each action is
          connected.
        </p>
        {(Object.keys(permissionLabels) as Array<keyof AgentPermissions>).map((action) => (
          <PolicyRow
            key={action}
            label={permissionLabels[action]}
            value={draft.permissions[action]}
            onChange={(policy) => changePolicy(action, policy)}
          />
        ))}
      </>
    ),
    limits: (
      <>
        <Input
          label="Replies per day"
          type="number"
          min={1}
          value={String(draft.limits.maxMessagesPerDay)}
          onChange={(value) => change({ limits: { ...draft.limits, maxMessagesPerDay: toNumber(value, 1, 10_000) } })}
          classNames={inputClasses}
        />
        <DiscountField value={draft.limits.maxDiscountPercent} onCommit={changeDiscount} />
      </>
    ),
    hours: (
      <>
        <SwitchRow
          label="Answer only during working hours"
          hint="Outside them it sends the away message"
          checked={draft.hours.enabled}
          onChange={(enabled) => change({ hours: { ...draft.hours, enabled } })}
        />
        {draft.hours.enabled && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {weekdays.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={draft.hours.days.includes(day.value)}
                  onClick={() => toggleDay(day.value)}
                  className={chipClasses(draft.hours.days.includes(day.value))}
                >
                  {day.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelClasses}>From</span>
                <input
                  type="time"
                  value={draft.hours.from}
                  onChange={(event) => change({ hours: { ...draft.hours, from: event.target.value } })}
                  className={fieldClasses}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelClasses}>To</span>
                <input
                  type="time"
                  value={draft.hours.to}
                  onChange={(event) => change({ hours: { ...draft.hours, to: event.target.value } })}
                  className={fieldClasses}
                />
              </label>
            </div>
            <div className={`flex flex-col gap-1.5 ${openSelect === "zone" ? "relative z-20" : ""}`}>
              <span className={labelClasses}>Time zone</span>
              <Select
                value={draft.hours.timeZone}
                onValueChange={(timeZone) => change({ hours: { ...draft.hours, timeZone } })}
                open={openSelect === "zone"}
                onOpenChange={(open) => setOpenSelect(open ? "zone" : null)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeZones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={labelClasses}>Away message</span>
              <textarea
                rows={3}
                value={draft.hours.awayMessage}
                onChange={(event) => change({ hours: { ...draft.hours, awayMessage: event.target.value } })}
                className={textAreaClasses}
              />
            </label>
          </>
        )}
      </>
    ),
    escalation: (
      <>
        <p className={hintClasses}>The employee hands the chat over and stays silent until you give it back.</p>
        <SwitchRow
          label="The customer is upset or complains"
          checked={draft.escalation.onComplaint}
          onChange={(onComplaint) => change({ escalation: { ...draft.escalation, onComplaint } })}
        />
        <SwitchRow
          label="The customer asks for a person"
          checked={draft.escalation.onHumanRequest}
          onChange={(onHumanRequest) => change({ escalation: { ...draft.escalation, onHumanRequest } })}
        />
        <SwitchRow
          label="It does not know the answer"
          checked={draft.escalation.onUnknownAnswer}
          onChange={(onUnknownAnswer) => change({ escalation: { ...draft.escalation, onUnknownAnswer } })}
        />
      </>
    )
  }

  return (
    <aside aria-label="Employee settings" className="flex w-[380px] shrink-0 flex-col border-l">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        {page !== "main" && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => setPage("main")}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <h2 className={`text-sm font-semibold ${page === "main" ? "pl-2" : ""}`}>
          {page === "main" ? "Settings" : pageTitles[page]}
        </h2>
        <button
          type="button"
          aria-label="Close settings"
          onClick={onClose}
          className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {page === "main" ? main : details[page]}
      </div>

      <ConfirmChangeModal change={risky} onCancel={() => setRisky(null)} />
    </aside>
  )
}
