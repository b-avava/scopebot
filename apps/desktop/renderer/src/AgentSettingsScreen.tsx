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
import type { ActionPolicy, Agent, AgentPermissions, AgentSettings, AgentTone } from "@scope-bot/domain"
import { type ReactNode, useState } from "react"
import { AvatarPicker } from "./AvatarPicker.tsx"
import { jobs, timeZones } from "./sampleData.ts"

interface AgentSettingsScreenProps {
  readonly agent: Agent
  readonly onSave: (settings: AgentSettings) => Promise<string | null>
  readonly onRemove: () => Promise<string | null>
}

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground", field: "rounded-xl" }

const toSettings = ({ id: _id, createdAt: _createdAt, ...settings }: Agent): AgentSettings => settings

const Section = ({ title, hint, children }: {
  readonly title: string
  readonly hint?: string
  readonly children: ReactNode
}) => (
  <section className="flex flex-col gap-4 border-b pb-7">
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint !== undefined && <p className="text-[13px] leading-[18px] text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </section>
)

const SwitchRow = ({ label, hint, checked, onChange }: {
  readonly label: string
  readonly hint?: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}) => (
  <div className="flex items-center justify-between gap-4">
    <span className="flex flex-col">
      <span className="text-sm font-medium">{label}</span>
      {hint !== undefined && <span className="text-[13px] text-muted-foreground">{hint}</span>}
    </span>
    <Switch ariaLabel={label} checked={checked} onCheckedChange={onChange} />
  </div>
)

const policies: ReadonlyArray<{ readonly value: ActionPolicy; readonly label: string }> = [
  { value: "auto", label: "On its own" },
  { value: "approve", label: "Ask first" },
  { value: "deny", label: "Never" }
]

const PolicyRow = ({ label, value, onChange }: {
  readonly label: string
  readonly value: ActionPolicy
  readonly onChange: (policy: ActionPolicy) => void
}) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm">{label}</span>
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-xl bg-muted p-0.5">
      {policies.map((policy) => (
        <button
          key={policy.value}
          type="button"
          role="radio"
          aria-checked={policy.value === value}
          onClick={() => onChange(policy.value)}
          className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
            policy.value === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          {policy.label}
        </button>
      ))}
    </div>
  </div>
)

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

const chipClasses = (selected: boolean) =>
  `rounded-full border px-3 py-1.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
    selected ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
  }`

const fieldClasses =
  "h-11 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const toNumber = (value: string, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(Number(value) || 0)))

export const AgentSettingsScreen = ({ agent, onSave, onRemove }: AgentSettingsScreenProps) => {
  const [draft, setDraft] = useState(() => toSettings(agent))
  const [openSelect, setOpenSelect] = useState<"job" | "zone" | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const change = (patch: Partial<AgentSettings>) => {
    setDraft({ ...draft, ...patch })
    setStatus(null)
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(toSettings(agent))
  const valid = draft.name.trim() !== ""
  const jobOptions = jobs.some((job) => job === draft.job) ? jobs : [draft.job, ...jobs]

  const save = async () => {
    const error = await onSave({ ...draft, name: draft.name.trim() })
    setStatus(error ?? "Saved")
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-6 py-7">
          <Section title="General">
            <SwitchRow
              label="Active"
              hint="A paused employee does not answer"
              checked={draft.active}
              onChange={(active) => change({ active })}
            />
            <Input label="Name" value={draft.name} onChange={(name) => change({ name })} classNames={inputClasses} />
            <div className={`flex flex-col gap-1.5 ${openSelect === "job" ? "relative z-20" : ""}`}>
              <span className="text-[13px] font-medium text-muted-foreground">Job</span>
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
                  {jobOptions.map((job) => <SelectItem key={job} value={job}>{job}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Section>

          <Section
            title="What it may do"
            hint="The employee only talks for now, so these act as instructions. They will be enforced in code as each action is connected."
          >
            {(Object.keys(permissionLabels) as Array<keyof AgentPermissions>).map((action) => (
              <PolicyRow
                key={action}
                label={permissionLabels[action]}
                value={draft.permissions[action]}
                onChange={(policy) => change({ permissions: { ...draft.permissions, [action]: policy } })}
              />
            ))}
          </Section>

          <Section title="Limits">
            <Input
              label="Replies per day"
              type="number"
              min={1}
              value={String(draft.limits.maxMessagesPerDay)}
              onChange={(value) =>
                change({ limits: { ...draft.limits, maxMessagesPerDay: toNumber(value, 1, 10_000) } })}
              classNames={inputClasses}
            />
            <Input
              label="Largest discount, %"
              type="number"
              min={0}
              max={100}
              value={String(draft.limits.maxDiscountPercent)}
              onChange={(value) =>
                change({ limits: { ...draft.limits, maxDiscountPercent: toNumber(value, 0, 100) } })}
              classNames={inputClasses}
            />
          </Section>

          <Section title="Working hours">
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
                    <span className="text-[13px] font-medium text-muted-foreground">From</span>
                    <input
                      type="time"
                      value={draft.hours.from}
                      onChange={(event) => change({ hours: { ...draft.hours, from: event.target.value } })}
                      className={fieldClasses}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-muted-foreground">To</span>
                    <input
                      type="time"
                      value={draft.hours.to}
                      onChange={(event) => change({ hours: { ...draft.hours, to: event.target.value } })}
                      className={fieldClasses}
                    />
                  </label>
                </div>
                <div className={`flex flex-col gap-1.5 ${openSelect === "zone" ? "relative z-20" : ""}`}>
                  <span className="text-[13px] font-medium text-muted-foreground">Time zone</span>
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
                      {timeZones.map((zone) => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-muted-foreground">Away message</span>
                  <textarea
                    rows={2}
                    value={draft.hours.awayMessage}
                    onChange={(event) => change({ hours: { ...draft.hours, awayMessage: event.target.value } })}
                    className="resize-none rounded-xl border bg-background px-3 py-2.5 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </>
            )}
          </Section>

          <Section
            title="When to call a human"
            hint="The employee hands the chat over and stays silent until you give it back."
          >
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
          </Section>

          <Section title="Style">
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
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted-foreground">Special rules (optional)</span>
              <textarea
                aria-label="Instructions"
                rows={4}
                value={draft.instructions}
                onChange={(event) => change({ instructions: event.target.value })}
                placeholder="For example: address patients formally, and recommend a check-up every six months."
                className="resize-none rounded-xl border bg-background px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </Section>

          <Section title="Look">
            <AvatarPicker
              compact
              value={{ shape: draft.shape, face: draft.face, color: draft.color }}
              onChange={change}
            />
          </Section>

          <Section title="Advanced">
            <Input
              label="AI model"
              placeholder="Server default"
              value={draft.model}
              onChange={(model) => change({ model: model.trim() })}
              classNames={inputClasses}
            />
          </Section>

          {confirmingRemove
            ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => {
                    void onRemove().then(setStatus)
                  }}
                >
                  Delete for good
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>Keep</Button>
              </div>
            )
            : (
              <div>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(true)}>Delete employee</Button>
              </div>
            )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t px-6 py-3">
        <Button size="sm" disabled={!changed || !valid} onClick={() => void save()}>Save</Button>
        {status !== null && <span role="status" className="text-[13px] text-muted-foreground">{status}</span>}
      </div>
    </div>
  )
}
