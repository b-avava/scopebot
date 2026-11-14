import {
  type ActionPolicy,
  emptyServiceDetails,
  type Service,
  type ServiceDetails,
  type ServicePackage,
  type ServicePricing
} from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { fieldBase, fieldClasses, OwnerBadge, PanelClose } from "./CrmParts.tsx"
import { toServiceDetails } from "./crmStats.ts"
import { DeleteConfirm } from "./DeleteConfirm.tsx"
import { errorMessage } from "./hooks.ts"

const pricings: ReadonlyArray<{ readonly value: ServicePricing; readonly label: string }> = [
  { value: "fixed", label: "Fixed" },
  { value: "from", label: "Starts from" },
  { value: "hourly", label: "Per hour" },
  { value: "monthly", label: "Monthly" }
]

const policies: ReadonlyArray<{ readonly value: ActionPolicy; readonly label: string }> = [
  { value: "auto", label: "Alone" },
  { value: "approve", label: "Ask first" },
  { value: "deny", label: "Never" }
]

const Segmented = <A extends string>({
  label,
  value,
  options,
  onChange
}: {
  readonly label: string
  readonly value: A
  readonly options: ReadonlyArray<{ readonly value: A; readonly label: string }>
  readonly onChange: (value: A) => void
}) => (
  <fieldset aria-label={label} className="flex min-w-0 flex-1 rounded-control bg-muted p-0.5">
    {options.map((option) => (
      <label
        key={option.value}
        className={`flex-1 cursor-pointer whitespace-nowrap rounded-control-sm px-2 py-1 text-center text-[13px] font-medium transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ring ${
          option.value === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
        }`}
      >
        <input
          type="radio"
          name={label}
          checked={option.value === value}
          onChange={() => onChange(option.value)}
          className="sr-only"
        />
        {option.label}
      </label>
    ))}
  </fieldset>
)

const PolicyRow = ({
  label,
  value,
  onChange
}: {
  readonly label: string
  readonly value: ActionPolicy
  readonly onChange: (value: ActionPolicy) => void
}) => (
  <div className="flex items-center gap-3">
    <span className="min-w-0 flex-1 text-sm">{label}</span>
    <div className="flex w-[276px] shrink-0">
      <Segmented label={label} value={value} options={policies} onChange={onChange} />
    </div>
  </div>
)

const PackageRow = ({
  item,
  onChange,
  onRemove
}: {
  readonly item: ServicePackage
  readonly onChange: (patch: Partial<ServicePackage>) => void
  readonly onRemove: () => void
}) => (
  <div className="flex items-center gap-1.5">
    <input
      aria-label="Package name"
      placeholder="Basic"
      value={item.name}
      onChange={(event) => onChange({ name: event.target.value })}
      className={`${fieldBase} w-24 shrink-0`}
    />
    <input
      aria-label="What it includes"
      placeholder="What it includes"
      value={item.description}
      onChange={(event) => onChange({ description: event.target.value })}
      className={`${fieldBase} min-w-0 flex-1`}
    />
    <input
      aria-label="Takes"
      placeholder="6 weeks"
      value={item.duration}
      onChange={(event) => onChange({ duration: event.target.value })}
      className={`${fieldBase} w-20 shrink-0`}
    />
    <input
      aria-label="Package price"
      type="number"
      min={0}
      value={item.price}
      onChange={(event) => onChange({ price: Math.max(0, Number(event.target.value) || 0) })}
      className={`${fieldBase} w-24 shrink-0 text-right tabular-nums`}
    />
    <button
      type="button"
      aria-label={`Remove ${item.name || "package"}`}
      onClick={onRemove}
      className="flex size-8 shrink-0 items-center justify-center rounded-control-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Trash2 className="size-4" />
    </button>
  </div>
)

const Preview = ({ service, dirty }: { readonly service: Service | null; readonly dirty: boolean }) => {
  const { agents } = useCrm()
  const sellers = agents.filter(
    (agent) => service !== null && (service.sellerIds.length === 0 || service.sellerIds.includes(agent.id))
  )
  const [agentId, setAgentId] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agent = sellers.find((item) => item.id === agentId) ?? sellers[0]
  if (service === null || agent === undefined) return null

  const ask = async () => {
    setBusy(true)
    const result = await window.scopeBot.previewService({ agentId: agent.id, text: question.trim() })
    setBusy(false)
    setAnswer(result.ok ? result.value.text : null)
    setError(result.ok ? null : errorMessage(result.error))
  }

  return (
    <section aria-label={`How ${agent.name} will answer`} className="flex flex-col gap-2.5 rounded-card bg-field p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">How {agent.name} will answer</h3>
        {sellers.length > 1 && (
          <select
            aria-label="Employee"
            value={agent.id}
            onChange={(event) => setAgentId(event.target.value)}
            className="bg-transparent text-[13px] text-muted-foreground outline-none"
          >
            {sellers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (question.trim() !== "") void ask()
        }}
      >
        <input
          aria-label="Question"
          placeholder={`How much is ${service.name}, and how long does it take?`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className={`${fieldBase} min-w-0 flex-1`}
        />
        <Button type="submit" size="sm" disabled={busy || dirty || question.trim() === ""}>
          {busy ? "Asking" : "Ask"}
        </Button>
      </form>
      {dirty && <p className="text-xs text-muted-foreground">Save first: employees answer from what is saved.</p>}
      {answer !== null && (
        <div className="flex gap-2.5">
          <OwnerBadge agent={agent} size={24} />
          <p className="min-w-0 flex-1 text-sm leading-[21px]">{answer}</p>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

export const ServicePanel = ({
  service,
  onClose,
  onCreated
}: {
  /** Empty means a new service. */
  readonly service: Service | null
  readonly onClose: () => void
  readonly onCreated: (id: string) => void
}) => {
  const { agents, deals, saveService, removeService } = useCrm()
  const saved: ServiceDetails = service === null ? { ...emptyServiceDetails, name: "" } : toServiceDetails(service)
  const [draft, setDraft] = useState<ServiceDetails>(saved)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const change = (patch: Partial<ServiceDetails>) => setDraft({ ...draft, ...patch })
  const changePackage = (index: number, patch: Partial<ServicePackage>) =>
    change({ packages: draft.packages.map((item, position) => (position === index ? { ...item, ...patch } : item)) })
  const toggleSeller = (id: ServiceDetails["sellerIds"][number]) =>
    change({
      sellerIds: draft.sellerIds.includes(id)
        ? draft.sellerIds.filter((sellerId) => sellerId !== id)
        : [...draft.sellerIds, id]
    })

  const save = async () => {
    setBusy(true)
    const result = await saveService({ ...draft, name: draft.name.trim() }, service?.id ?? null)
    setBusy(false)
    setError(result.ok ? null : errorMessage(result.error))
    if (result.ok && service === null) onCreated(result.value.id)
  }

  const linked = service === null ? 0 : deals.filter((deal) => deal.serviceIds.includes(service.id)).length
  const panelClasses = "absolute inset-y-0 right-0 z-20 w-[640px] max-w-full border-l bg-background shadow-2xl"

  if (confirming && service !== null) {
    return (
      <aside aria-label={service.name} className={panelClasses}>
        <DeleteConfirm
          name={service.name}
          description="Employees stop offering it, and it is taken off its deals. It cannot be undone."
          error={error}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void removeService(service.id).then((result) => {
              if (result.ok) onClose()
              else setError(errorMessage(result.error))
            })
          }}
        />
      </aside>
    )
  }

  return (
    <aside aria-label={service?.name ?? "New service"} className={`${panelClasses} flex flex-col`}>
      <header className="flex shrink-0 flex-col gap-1 border-b px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <input
            aria-label="Category"
            placeholder="Category"
            value={draft.category}
            onChange={(event) => change({ category: event.target.value })}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-muted-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-[13px] text-muted-foreground">Active</span>
          <Switch ariaLabel="Active" checked={draft.active} onCheckedChange={(active) => change({ active })} />
          {service !== null && (
            <button
              type="button"
              aria-label="Delete service"
              onClick={() => setConfirming(true)}
              className="text-muted-foreground outline-none transition-colors duration-150 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <PanelClose onClose={onClose} />
        </div>
        <input
          aria-label="Name"
          placeholder="Service name"
          value={draft.name}
          onChange={(event) => change({ name: event.target.value })}
          className="bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          aria-label="Description"
          placeholder="What the customer gets"
          value={draft.description}
          onChange={(event) => change({ description: event.target.value })}
          className="bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-4">
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">Price</h3>
          <Segmented
            label="Pricing"
            value={draft.pricing}
            options={pricings}
            onChange={(pricing) => change({ pricing })}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Price, empty if there is none yet</span>
              <input
                type="number"
                min={0}
                value={draft.price ?? ""}
                onChange={(event) =>
                  change({ price: event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0) })
                }
                className={fieldClasses}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Takes</span>
              <input
                placeholder="8 weeks"
                value={draft.duration}
                onChange={(event) => change({ duration: event.target.value })}
                className={fieldClasses}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Appointment, min</span>
              <input
                type="number"
                min={5}
                step={5}
                placeholder="Not booked"
                value={draft.minutes ?? ""}
                onChange={(event) => {
                  const { minutes: _old, ...rest } = draft
                  const value = Math.round(Number(event.target.value))
                  setDraft(
                    event.target.value === "" || value < 5 ? rest : { ...rest, minutes: Math.min(value, 24 * 60) }
                  )
                }}
                className={fieldClasses}
              />
            </label>
          </div>
          {draft.packages.map((item, index) => (
            <PackageRow
              // Rows have no ids and only ever change in place or from the end.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above.
              key={index}
              item={item}
              onChange={(patch) => changePackage(index, patch)}
              onRemove={() => change({ packages: draft.packages.filter((_, position) => position !== index) })}
            />
          ))}
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                change({ packages: [...draft.packages, { name: "", description: "", duration: "", price: 0 }] })
              }
            >
              <Plus className="size-4" />
              Add a package
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">What employees may do</h3>
            <p className="text-[13px] text-muted-foreground">
              Employees get these rules as instructions. Until they have tools, nothing else enforces them.
            </p>
          </div>
          <PolicyRow
            label="Name the price"
            value={draft.quotePolicy}
            onChange={(quotePolicy) => change({ quotePolicy })}
          />
          <PolicyRow
            label="Send a quote"
            value={draft.proposalPolicy}
            onChange={(proposalPolicy) => change({ proposalPolicy })}
          />
          <PolicyRow
            label="Offer a discount"
            value={draft.discountPolicy}
            onChange={(discountPolicy) => change({ discountPolicy })}
          />
          <label className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">Largest discount</span>
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <input
                type="number"
                min={0}
                max={100}
                value={draft.maxDiscountPercent}
                onChange={(event) =>
                  change({ maxDiscountPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })
                }
                className={`${fieldBase} w-20 text-right text-foreground`}
              />
              %
            </span>
          </label>
          {agents.length > 0 && (
            <fieldset aria-label="Who can sell it" className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm">
                Who can sell it{draft.sellerIds.length === 0 ? ": everyone" : ""}
              </span>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  aria-pressed={draft.sellerIds.includes(agent.id)}
                  onClick={() => toggleSeller(agent.id)}
                  className={`flex h-[30px] items-center gap-1.5 rounded-control-sm pr-2.5 pl-1.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
                    draft.sellerIds.includes(agent.id) ? "bg-accent" : "border text-muted-foreground"
                  }`}
                >
                  <OwnerBadge agent={agent} />
                  {agent.name}
                </button>
              ))}
            </fieldset>
          )}
        </section>

        <Preview service={service} dirty={dirty} />
      </div>

      {error !== null && (
        <p role="alert" className="shrink-0 px-5 pb-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <footer className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          {service !== null && `In ${linked} ${linked === 1 ? "deal" : "deals"}`}
        </span>
        <Button size="sm" variant="outline" disabled={busy || !dirty} onClick={() => setDraft(saved)}>
          Discard
        </Button>
        <Button size="sm" disabled={busy || !dirty || draft.name.trim() === ""} onClick={() => void save()}>
          Save
        </Button>
      </footer>
    </aside>
  )
}
