import {
  type ActionPolicy,
  type AgentRole,
  type CreateAgent,
  type ProviderCatalog,
  type ProviderPreferences,
  rolePresets
} from "@scope-bot/domain"
import { LensAvatar } from "@scope-bot/ui/components/avatar/LensAvatar.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { Check } from "lucide-react"
import { useState } from "react"
import { ColorPicker, defaultColor, roles, SignIcon, watchArea } from "./Avatar.tsx"
import { ModelField, type ModelFields } from "./ModelSettings.tsx"
import { useModels } from "./ModelsContext.tsx"
import { TitleBar } from "./TitleBar.tsx"

interface HireScreenProps {
  readonly onHire: (input: CreateAgent) => Promise<string | null>
}

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground" }

/** Starts on the default provider, or else the first one that works. */
const startingModel = (
  usable: ReadonlyArray<ProviderCatalog> | null,
  preferences: ProviderPreferences
): ModelFields => {
  const ready = usable?.filter((item) => item.models.length > 0) ?? []
  const provider = ready.find((item) => item.id === preferences.defaultProvider) ?? ready[0]
  const listed = provider?.models.some((model) => model.id === provider.defaultModel) === true
  return {
    provider: provider?.id ?? "api",
    model: listed ? (provider?.defaultModel ?? "") : (provider?.models[0]?.id ?? ""),
    reasoning: "default"
  }
}

const policyText: Record<ActionPolicy, string> = { auto: "Alone", approve: "Asks you first", deny: "Never" }

/** What a new employee may do with the role picked, read from the same preset the server uses. */
const MayDo = ({ name, role }: { readonly name: string; readonly role: AgentRole }) => {
  const { permissions, limits } = rolePresets[role]
  const discount =
    permissions.offerDiscounts === "deny" || limits.maxDiscountPercent === 0
      ? "Never"
      : `${policyText[permissions.offerDiscounts]}, up to ${limits.maxDiscountPercent}%`
  const rows: ReadonlyArray<readonly [string, string, boolean]> = [
    ["Offer a discount", discount, permissions.offerDiscounts === "approve"],
    ["Send a payment link", policyText[permissions.sendPaymentLinks], permissions.sendPaymentLinks === "approve"],
    ["Send documents", policyText[permissions.sendDocuments], permissions.sendDocuments === "approve"],
    ["Replies a day", String(limits.maxMessagesPerDay), false]
  ]

  return (
    <section aria-label="What the new employee may do" className="flex flex-col gap-2.5 rounded-card bg-field p-4">
      <h2 className="text-[13px] font-semibold">What {name || "they"} may do from the start</h2>
      {rows.map(([label, value, asks]) => (
        <p key={label} className="flex justify-between gap-3 text-[13px]">
          <span className="text-muted-foreground">{label}</span>
          <span className={`font-medium ${asks ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</span>
        </p>
      ))}
      <p className="text-xs text-muted-foreground">You can change all of it later in Settings.</p>
    </section>
  )
}

const RolePicker = ({
  value,
  onChange
}: {
  readonly value: AgentRole
  readonly onChange: (role: AgentRole) => void
}) => (
  <fieldset aria-label="Start from a role" className="flex flex-col gap-2">
    <legend className="flex flex-col gap-0.5 pb-1">
      <span className="text-[13px] font-medium text-muted-foreground">Start from a role</span>
      <span className="text-xs text-muted-foreground">Sets the first permissions and the sign. Only used now.</span>
    </legend>
    {roles.map((role) => {
      const selected = role.value === value
      const sign = rolePresets[role.value].sign
      return (
        <label
          key={role.value}
          className={`flex cursor-pointer items-center gap-3 rounded-control px-3.5 py-3 transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ring ${
            selected
              ? "border-[1.5px] border-foreground bg-field"
              : `hover:bg-muted ${sign === null ? "border border-dashed" : "border"}`
          }`}
        >
          <input
            type="radio"
            name="hire-role"
            checked={selected}
            onChange={() => onChange(role.value)}
            className="sr-only"
          />
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
              sign === null ? "border-[1.5px] border-dashed" : "bg-muted"
            }`}
          >
            <SignIcon sign={sign} className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{role.label}</span>
            <span className="text-xs text-muted-foreground">{role.description}</span>
          </span>
          {selected && (
            <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="size-3" strokeWidth={3.5} />
            </span>
          )}
        </label>
      )
    })}
  </fieldset>
)

export const HireScreen = ({ onHire }: HireScreenProps) => {
  const [name, setName] = useState("")
  const [job, setJob] = useState("")
  const [role, setRole] = useState<AgentRole>("sales")
  const [color, setColor] = useState<string>(defaultColor)
  const { usable, preferences } = useModels()
  const [picked, setPicked] = useState<ModelFields | null>(null)
  const model = picked ?? startingModel(usable, preferences)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const trimmedJob = job.trim()

  const hire = async () => {
    setSaving(true)
    setError(null)
    setError(await onHire({ name: trimmedName, job: trimmedJob, role, color, ...model }))
    setSaving(false)
  }

  return (
    <>
      <TitleBar>
        <LensAvatar size={20} color={color} />
        <span className="text-sm font-semibold">New employee</span>
      </TitleBar>

      <div {...watchArea} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[912px] flex-col items-center justify-center gap-5 px-6 py-6">
          <LensAvatar size={104} color={color} sign={rolePresets[role].sign} live />
          <ColorPicker value={color} onChange={setColor} />

          <div className="flex w-full flex-wrap items-start gap-8">
            <div className="flex min-w-[320px] flex-1 flex-col gap-3.5">
              <Input label="Name" placeholder="Nino" value={name} onChange={setName} classNames={inputClasses} />
              <div className="flex flex-col gap-1.5">
                <Input
                  label="Job title"
                  placeholder="Sales manager, accountant, delivery coordinator"
                  value={job}
                  onChange={setJob}
                  classNames={inputClasses}
                />
                <span className="text-xs text-muted-foreground">
                  In your own words. Customers and the model see it. It changes nothing else.
                </span>
              </div>
              <ModelField value={model} onChange={(patch) => setPicked({ ...model, ...patch })} />
              <MayDo name={trimmedName} role={role} />
            </div>
            <div className="min-w-[320px] flex-1">
              <RolePicker value={role} onChange={setRole} />
            </div>
          </div>

          <Button disabled={trimmedName === "" || trimmedJob === "" || saving} onClick={() => void hire()}>
            {trimmedName === "" ? "Hire" : `Hire ${trimmedName}`}
          </Button>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
