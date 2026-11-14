import type { Deal, DealDetails, Pipeline, Service, Stage } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Trash2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { ApprovalCard, Composer, fieldClasses, ownerOptions, PanelClose, TaskList, Timeline } from "./CrmParts.tsx"
import { chanceOf, priceLabel, stageOf, toDealDetails } from "./crmStats.ts"
import { DeleteConfirm } from "./DeleteConfirm.tsx"
import { errorMessage } from "./hooks.ts"
import { LinkedAppointments } from "./LinkedAppointments.tsx"

const Fact = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    {children}
  </div>
)

/** A text field that saves when the person leaves it. */
const SavedText = ({
  value,
  label,
  type = "text",
  className = fieldClasses,
  onSave
}: {
  readonly value: string
  readonly label: string
  readonly type?: "text" | "date" | "number"
  readonly className?: string
  readonly onSave: (value: string) => void
}) => (
  <input
    key={value}
    aria-label={label}
    type={type}
    min={type === "number" ? 0 : undefined}
    defaultValue={value}
    onBlur={(event) => {
      if (event.target.value !== value) onSave(event.target.value)
    }}
    className={className}
  />
)

const StageBar = ({
  deal,
  pipeline,
  onMove
}: {
  readonly deal: Deal
  readonly pipeline: Pipeline
  readonly onMove: (stage: Stage) => void
}) => {
  const index = pipeline.stages.findIndex((stage) => stage.id === deal.stageId)

  return (
    <fieldset aria-label="Stage" className="flex gap-1">
      {pipeline.stages.map((stage, position) => (
        <button
          key={stage.id}
          type="button"
          aria-pressed={stage.id === deal.stageId}
          onClick={() => onMove(stage)}
          className="flex min-w-0 flex-1 flex-col gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={`h-1 w-full rounded-full ${position <= index ? "bg-foreground" : "bg-border"}`} />
          <span
            className={`truncate text-xs ${
              stage.id === deal.stageId ? "font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            {stage.name}
          </span>
        </button>
      ))}
    </fieldset>
  )
}

const ServicesTab = ({
  deal,
  services,
  onToggle
}: {
  readonly deal: Deal
  readonly services: ReadonlyArray<Service>
  readonly onToggle: (service: Service) => void
}) =>
  services.length === 0 ? (
    <p className="text-sm text-muted-foreground">Add services in the Services section to link them here.</p>
  ) : (
    <ul className="flex flex-col gap-1">
      {services.map((service) => (
        <li key={service.id}>
          <label className="flex items-center gap-2.5 py-1 text-sm">
            <input type="checkbox" checked={deal.serviceIds.includes(service.id)} onChange={() => onToggle(service)} />
            <span className="min-w-0 flex-1 truncate">{service.name}</span>
            <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{priceLabel(service)}</span>
          </label>
        </li>
      ))}
    </ul>
  )

type PanelTab = "activity" | "tasks" | "services"

export const DealPanel = ({
  deal,
  pipeline,
  onClose,
  onLose
}: {
  readonly deal: Deal
  readonly pipeline: Pipeline
  readonly onClose: () => void
  readonly onLose: (losing: { readonly deal: Deal; readonly stage: Stage }) => void
}) => {
  const { agents, contacts, services, activities, approvals, currency, saveDeal, removeDeal } = useCrm()
  const [tab, setTab] = useState<PanelTab>("activity")
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (patch: Partial<DealDetails>) => {
    const result = await saveDeal({ ...toDealDetails(deal), ...patch }, deal.id)
    setError(result.ok ? null : errorMessage(result.error))
  }
  const move = (stage: Stage) => {
    if (stage.id === deal.stageId) return
    if (stage.kind === "lost") onLose({ deal, stage })
    else void save({ stageId: stage.id })
  }

  const stage = stageOf(deal, pipeline)
  const own = activities.filter((activity) => activity.dealId === deal.id)
  const tasks = own.filter((activity) => activity.kind === "task")
  const history = own.filter((activity) => activity.kind !== "task")
  const waiting = approvals.filter((approval) => approval.dealId === deal.id && approval.status === "pending")
  const people = [...contacts].sort((first, second) => first.name.localeCompare(second.name))

  if (confirming) {
    return (
      <aside
        aria-label={deal.title}
        className="absolute inset-y-0 right-0 z-20 w-[620px] max-w-full border-l bg-background shadow-2xl"
      >
        <DeleteConfirm
          name={deal.title}
          description="This removes the deal with its notes and tasks. It cannot be undone."
          error={error}
          busy={false}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void removeDeal(deal.id).then((result) => {
              if (result.ok) onClose()
              else setError(errorMessage(result.error))
            })
          }}
        />
      </aside>
    )
  }

  return (
    <aside
      aria-label={deal.title}
      className="absolute inset-y-0 right-0 z-20 flex w-[620px] max-w-full flex-col border-l bg-background shadow-2xl"
    >
      <header className="flex shrink-0 flex-col gap-3 px-5 pt-3.5 pb-4">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            {pipeline.name} › {stage?.name}
          </span>
          <button
            type="button"
            aria-label="Delete deal"
            onClick={() => setConfirming(true)}
            className="text-muted-foreground outline-none transition-colors duration-150 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-4" />
          </button>
          <PanelClose onClose={onClose} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <SavedText
            value={deal.title}
            label="Title"
            className="min-w-0 flex-1 bg-transparent text-xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onSave={(title) => {
              if (title.trim() !== "") void save({ title: title.trim() })
            }}
          />
          <span className="flex shrink-0 items-baseline gap-1">
            <SavedText
              value={String(deal.amount)}
              label="Amount"
              type="number"
              className="w-28 bg-transparent text-right text-xl font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onSave={(amount) => void save({ amount: Math.max(0, Number(amount) || 0) })}
            />
            <span className="text-[13px] text-muted-foreground">{currency}</span>
          </span>
        </div>
        <StageBar deal={deal} pipeline={pipeline} onMove={move} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pb-4">
        {waiting.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} />
        ))}
        <LinkedAppointments dealId={deal.id} />
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Fact label="Next step">
            <SavedText value={deal.nextStep} label="Next step" onSave={(nextStep) => void save({ nextStep })} />
          </Fact>
          <Fact label="Next step date">
            <SavedText
              value={deal.nextStepAt ?? ""}
              label="Next step date"
              type="date"
              onSave={(date) => void save({ nextStepAt: date === "" ? null : date })}
            />
          </Fact>
          <Fact label="Expected close">
            <SavedText
              value={deal.closeDate ?? ""}
              label="Expected close"
              type="date"
              onSave={(date) => void save({ closeDate: date === "" ? null : date })}
            />
          </Fact>
          <Fact label={`Chance, usually ${stage?.probability ?? 0}%`}>
            <SavedText
              value={deal.probability === null ? "" : String(deal.probability)}
              label="Chance"
              type="number"
              onSave={(value) =>
                void save({ probability: value === "" ? null : Math.min(100, Math.max(0, Number(value) || 0)) })
              }
            />
          </Fact>
          <Fact label="Owner">
            <select
              aria-label="Owner"
              value={deal.ownerId ?? "you"}
              onChange={(event) =>
                void save({ ownerId: agents.find((agent) => agent.id === event.target.value)?.id ?? null })
              }
              className={fieldClasses}
            >
              {ownerOptions(agents).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Fact>
          <Fact label="Source">
            <SavedText value={deal.source} label="Source" onSave={(source) => void save({ source })} />
          </Fact>
          <Fact label="Contact">
            <select
              aria-label="Contact"
              value={deal.contactId ?? ""}
              onChange={(event) =>
                void save({ contactId: people.find((item) => item.id === event.target.value)?.id ?? null })
              }
              className={fieldClasses}
            >
              <option value="">No contact</option>
              {people.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </Fact>
          {stage?.kind === "lost" && (
            <Fact label="Why it was lost">
              <SavedText
                value={deal.lostReason}
                label="Why it was lost"
                onSave={(lostReason) => void save({ lostReason })}
              />
            </Fact>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Counts towards the forecast at {chanceOf(deal, stage)}%.</p>

        <div className="flex shrink-0 gap-1 border-b pb-2">
          <Button size="sm" variant={tab === "activity" ? "secondary" : "ghost"} onClick={() => setTab("activity")}>
            Activity
          </Button>
          <Button size="sm" variant={tab === "tasks" ? "secondary" : "ghost"} onClick={() => setTab("tasks")}>
            Tasks {tasks.length}
          </Button>
          <Button size="sm" variant={tab === "services" ? "secondary" : "ghost"} onClick={() => setTab("services")}>
            Services {deal.serviceIds.length}
          </Button>
        </div>

        {tab === "activity" && <Timeline items={history} empty="Nothing has happened yet." />}
        {tab === "tasks" && <TaskList tasks={tasks} empty="No tasks yet." />}
        {tab === "services" && (
          <ServicesTab
            deal={deal}
            services={services}
            onToggle={(service) =>
              void save({
                serviceIds: deal.serviceIds.includes(service.id)
                  ? deal.serviceIds.filter((id) => id !== service.id)
                  : [...deal.serviceIds, service.id]
              })
            }
          />
        )}
      </div>

      <div className="shrink-0 border-t px-5 py-3">
        <Composer links={{ contactId: deal.contactId, dealId: deal.id }} placeholder="Add a note" />
      </div>
    </aside>
  )
}
