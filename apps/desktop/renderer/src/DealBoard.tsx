import type { Deal, Pipeline, Stage } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Plus } from "lucide-react"
import { type DragEvent, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { OwnerBadge } from "./CrmParts.tsx"
import { contactLineOf, dayLabel, money } from "./crmStats.ts"

const DEAL_TYPE = "application/x-scope-deal"

interface DropProps {
  readonly stage: Stage
  readonly deals: ReadonlyArray<Deal>
  readonly onMove: (deal: Deal, stage: Stage) => void
}

/** Lets a deal be dropped here, and says so while one is over it. */
const useDrop = ({ stage, deals, onMove }: DropProps) => {
  const [over, setOver] = useState(false)
  return {
    over,
    handlers: {
      onDragOver: (event: DragEvent) => {
        event.preventDefault()
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        setOver(false)
        const deal = deals.find((item) => item.id === event.dataTransfer.getData(DEAL_TYPE))
        if (deal !== undefined) onMove(deal, stage)
      }
    }
  }
}

const nextStepLine = (deal: Deal, today: string) => {
  if (deal.nextStep === "") return { text: "No next step", when: "", late: false }
  return {
    text: deal.nextStep,
    when: dayLabel(deal.nextStepAt),
    late: deal.nextStepAt !== null && deal.nextStepAt < today
  }
}

const DealCard = ({ deal, onOpen }: { readonly deal: Deal; readonly onOpen: () => void }) => {
  const { agents, contacts, approvals, decideApproval } = useCrm()
  const owner = agents.find((agent) => agent.id === deal.ownerId)
  const approval = approvals.find((item) => item.dealId === deal.id && item.status === "pending")
  const line = contactLineOf(deal.contactId, contacts)
  const next = nextStepLine(deal, new Date().toISOString().slice(0, 10))

  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DEAL_TYPE, deal.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      className={`rounded-control-sm border bg-background transition-colors duration-150 hover:bg-muted ${
        approval === undefined ? "" : "border-amber-400"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2 rounded-control-sm p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{deal.title}</span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums">{money(deal.amount)}</span>
        </span>
        {line !== "" && <span className="truncate text-[13px] text-muted-foreground">{line}</span>}
        <span className="flex items-center gap-1.5">
          <OwnerBadge agent={owner} />
          {approval === undefined ? (
            <>
              <span
                className={`min-w-0 flex-1 truncate text-xs ${next.late ? "text-destructive" : "text-muted-foreground"}`}
              >
                {next.text}
              </span>
              <span className={`shrink-0 text-xs ${next.late ? "text-destructive" : "text-muted-foreground"}`}>
                {next.when}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-amber-600 dark:text-amber-400">
              {approval.title}
            </span>
          )}
        </span>
      </button>
      {approval !== undefined && (
        <div className="flex gap-1.5 px-3 pb-3">
          <Button
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => void decideApproval(approval.id, { status: "approved" })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-xs"
            onClick={() => void decideApproval(approval.id, { status: "declined" })}
          >
            Decline
          </Button>
        </div>
      )}
    </li>
  )
}

const StageColumn = ({
  stage,
  stageDeals,
  allDeals,
  onOpen,
  onAdd,
  onMove
}: {
  readonly stage: Stage
  readonly stageDeals: ReadonlyArray<Deal>
  readonly allDeals: ReadonlyArray<Deal>
  readonly onOpen: (id: string) => void
  readonly onAdd: () => void
  readonly onMove: (deal: Deal, stage: Stage) => void
}) => {
  const { over, handlers } = useDrop({ stage, deals: allDeals, onMove })
  const total = stageDeals.reduce((sum, deal) => sum + deal.amount, 0)

  return (
    <section
      aria-label={stage.name}
      {...handlers}
      className={`flex w-64 min-w-56 flex-1 flex-col gap-1.5 rounded-card bg-field p-1.5 transition-shadow duration-150 ${
        over ? "ring-2 ring-ring" : ""
      }`}
    >
      <header className="flex h-8 shrink-0 items-center gap-2 pl-1.5">
        <h2 className="truncate text-[13px] font-semibold">{stage.name}</h2>
        <span className="text-[13px] tabular-nums text-muted-foreground">{stageDeals.length}</span>
        <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">{money(total)}</span>
        <button
          type="button"
          aria-label={`Add a deal to ${stage.name}`}
          title="Add a deal"
          onClick={onAdd}
          className="flex size-7 shrink-0 items-center justify-center rounded-control-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" />
        </button>
      </header>
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {stageDeals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onOpen={() => onOpen(deal.id)} />
        ))}
      </ul>
    </section>
  )
}

const closedStyle = {
  won: {
    box: "border-emerald-500/40 bg-emerald-500/10",
    title: "text-emerald-600 dark:text-emerald-400",
    hint: "Drop a deal here to close it as won"
  },
  lost: {
    box: "border-destructive/35 bg-destructive/10",
    title: "text-destructive",
    hint: "Drop here and pick a reason"
  }
} as const

const ClosedZone = ({
  stage,
  kind,
  stageDeals,
  allDeals,
  onMove
}: {
  readonly stage: Stage
  readonly kind: "won" | "lost"
  readonly stageDeals: ReadonlyArray<Deal>
  readonly allDeals: ReadonlyArray<Deal>
  readonly onMove: (deal: Deal, stage: Stage) => void
}) => {
  const { over, handlers } = useDrop({ stage, deals: allDeals, onMove })
  const style = closedStyle[kind]

  return (
    <section
      aria-label={stage.name}
      {...handlers}
      className={`flex min-h-0 flex-1 flex-col gap-1.5 rounded-card border border-dashed p-3 transition-shadow duration-150 ${style.box} ${
        over ? "ring-2 ring-ring" : ""
      }`}
    >
      <div className="flex justify-between text-[13px]">
        <h2 className={`font-semibold ${style.title}`}>{stage.name}</h2>
        <span className="tabular-nums text-muted-foreground">{stageDeals.length}</span>
      </div>
      <span className="text-lg font-semibold tabular-nums">
        {money(stageDeals.reduce((sum, deal) => sum + deal.amount, 0))}
      </span>
      <p className="text-xs text-muted-foreground">{style.hint}</p>
    </section>
  )
}

export const DealBoard = ({
  pipeline,
  deals,
  onOpen,
  onAdd,
  onMove
}: {
  readonly pipeline: Pipeline
  readonly deals: ReadonlyArray<Deal>
  readonly onOpen: (id: string) => void
  readonly onAdd: (stage: Stage) => void
  readonly onMove: (deal: Deal, stage: Stage) => void
}) => {
  const inStage = (stage: Stage) => deals.filter((deal) => deal.stageId === stage.id)
  const open = pipeline.stages.filter((stage) => stage.kind === "open")
  const closed = pipeline.stages.filter(
    (stage): stage is Stage & { readonly kind: "won" | "lost" } => stage.kind !== "open"
  )

  return (
    <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto px-4 pb-4">
      {open.map((stage) => (
        <StageColumn
          key={stage.id}
          stage={stage}
          stageDeals={inStage(stage)}
          allDeals={deals}
          onOpen={onOpen}
          onAdd={() => onAdd(stage)}
          onMove={onMove}
        />
      ))}
      <div className="flex w-44 shrink-0 flex-col gap-2.5">
        {closed.map((stage) => (
          <ClosedZone
            key={stage.id}
            stage={stage}
            kind={stage.kind}
            stageDeals={inStage(stage)}
            allDeals={deals}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  )
}
