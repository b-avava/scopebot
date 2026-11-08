import type { Deal, Pipeline, Stage } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { AttentionPill, FilterSelect, ownerOptions, SearchField, Stat, Tab } from "./CrmParts.tsx"
import {
  contactLineOf,
  type DealFilters,
  filterDeals,
  money,
  noDealFilters,
  summarizeDeals,
  toDealDetails
} from "./crmStats.ts"
import { DealBoard } from "./DealBoard.tsx"
import { type DealCreating, DealModal } from "./DealModal.tsx"
import { DealPanel } from "./DealPanel.tsx"
import { DealTable } from "./DealTable.tsx"
import { errorMessage } from "./hooks.ts"
import { LostModal } from "./LostModal.tsx"
import { StagesModal } from "./StagesModal.tsx"
import { TitleBar } from "./TitleBar.tsx"

const closesOptions = [
  { value: "any", label: "Any time" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "overdue", label: "Overdue" }
]

const Workspace = ({ pipeline }: { readonly pipeline: Pipeline }) => {
  const { deals, contacts, agents, approvals, currency, saveDeal } = useCrm()
  const [view, setView] = useState<"board" | "list">("board")
  const [filters, setFilters] = useState<DealFilters>(noDealFilters)
  const [onlyWaiting, setOnlyWaiting] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState<DealCreating | null>(null)
  const [editingStages, setEditingStages] = useState(false)
  const [losing, setLosing] = useState<{ readonly deal: Deal; readonly stage: Stage } | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const waiting = useMemo(
    () => approvals.filter((approval) => approval.status === "pending" && approval.dealId !== null),
    [approvals]
  )
  const now = new Date()
  const own = deals.filter((deal) => deal.pipelineId === pipeline.id)
  const matching = filterDeals(own, filters, (deal) => contactLineOf(deal.contactId, contacts), now)
  const shown = onlyWaiting ? matching.filter((deal) => waiting.some((item) => item.dealId === deal.id)) : matching
  const summary = summarizeDeals(shown, pipeline, now)
  const open = own.find((deal) => deal.id === openId)
  const sources = [...new Set(own.map((deal) => deal.source).filter((source) => source !== ""))]
  const first = pipeline.stages.find((stage) => stage.kind === "open")

  const moveTo = async (deal: Deal, stage: Stage) => {
    if (deal.stageId === stage.id) return
    if (stage.kind === "lost") {
      setLosing({ deal, stage })
      return
    }
    const result = await saveDeal({ ...toDealDetails(deal), stageId: stage.id }, deal.id)
    setStatus(result.ok ? null : errorMessage(result.error))
  }

  return (
    <>
      <TitleBar>
        <span className="text-sm font-semibold">Deals</span>
        <span className="text-sm text-muted-foreground">{pipeline.name}</span>
        <div className="flex items-center gap-0.5 pl-2">
          <Tab active={view === "board"} onSelect={() => setView("board")}>
            Board
          </Tab>
          <Tab active={view === "list"} onSelect={() => setView("list")}>
            List
          </Tab>
        </div>
        <div className="window-no-drag ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditingStages(true)}>
            Edit stages
          </Button>
          {first !== undefined && (
            <Button size="sm" onClick={() => setCreating({ stage: first })}>
              <Plus className="size-4" />
              New deal
            </Button>
          )}
        </div>
      </TitleBar>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SearchField
            value={filters.search}
            placeholder="Search deals, companies, people"
            onChange={(search) => setFilters({ ...filters, search })}
          />
          <FilterSelect
            label="Owner"
            value={filters.owner}
            options={[{ value: "all", label: "Everyone" }, ...ownerOptions(agents)]}
            onChange={(owner) => setFilters({ ...filters, owner })}
          />
          <FilterSelect
            label="Closes"
            value={filters.closes}
            options={closesOptions}
            onChange={(closes) => setFilters({ ...filters, closes: closes as DealFilters["closes"] })}
          />
          <FilterSelect
            label="Source"
            value={filters.source}
            options={[{ value: "all", label: "All" }, ...sources.map((value) => ({ value, label: value }))]}
            onChange={(source) => setFilters({ ...filters, source })}
          />
          {waiting.length > 0 && (
            <div className="ml-auto">
              <AttentionPill onClick={() => setOnlyWaiting(!onlyWaiting)}>
                {onlyWaiting
                  ? "Show all deals"
                  : `${waiting.length} ${waiting.length === 1 ? "needs" : "need"} your OK`}
              </AttentionPill>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-baseline gap-x-7 gap-y-1 px-4 pb-3.5">
          <Stat value={money(summary.openAmount)} label={`${currency} open in ${summary.openCount} deals`} />
          <Stat value={money(summary.weighted)} label={`${currency} weighted forecast`} />
          <Stat value={money(summary.wonThisMonth)} label={`${currency} won this month`} />
          {summary.winRate !== null && <Stat value={`${summary.winRate}%`} label="win rate" />}
          {summary.medianDays !== null && <Stat value={String(summary.medianDays)} label="days to close, median" />}
        </div>

        {status !== null && (
          <p role="alert" className="px-4 pb-2 text-sm text-destructive">
            {status}
          </p>
        )}

        {view === "board" ? (
          <DealBoard
            pipeline={pipeline}
            deals={shown}
            onOpen={setOpenId}
            onAdd={(stage) => setCreating({ stage })}
            onMove={(deal, stage) => void moveTo(deal, stage)}
          />
        ) : (
          <DealTable pipeline={pipeline} deals={shown} onOpen={setOpenId} />
        )}

        {open !== undefined && (
          <DealPanel key={open.id} deal={open} pipeline={pipeline} onClose={() => setOpenId(null)} onLose={setLosing} />
        )}
      </div>

      <DealModal
        creating={creating}
        pipeline={pipeline}
        onClose={() => setCreating(null)}
        onCreated={(id) => {
          setCreating(null)
          setOpenId(id)
        }}
      />
      <StagesModal open={editingStages} pipeline={pipeline} onClose={() => setEditingStages(false)} />
      <LostModal losing={losing} onClose={() => setLosing(null)} />
    </>
  )
}

export const DealsScreen = () => {
  const { pipelines, online, failure, loaded } = useCrm()
  const pipeline = pipelines[0]
  const problem = online ? failure : "offline"

  if (pipeline !== undefined) return <Workspace pipeline={pipeline} />

  return (
    <>
      <TitleBar>
        <span className="text-sm font-semibold">Deals</span>
      </TitleBar>
      {problem !== null && (
        <p role="alert" className="p-6 text-sm text-destructive">
          {errorMessage(problem)}
        </p>
      )}
      {problem === null && !loaded && <p className="p-6 text-sm text-muted-foreground">Loading deals</p>}
    </>
  )
}
