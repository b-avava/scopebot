import type { Deal, Pipeline } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { useCrm } from "./CrmContext.tsx"
import { ownerOptions, saveFile, Tick } from "./CrmParts.tsx"
import { chanceOf, contactLineOf, dayLabel, money, stageOf, toCsv, toDealDetails } from "./crmStats.ts"
import { errorMessage } from "./hooks.ts"

const PAGE_SIZE = 20

type SortKey = "title" | "amount" | "closeDate"

const sortValue = (deal: Deal, key: SortKey) => (key === "closeDate" ? (deal.closeDate ?? "9999") : deal[key])

const compare = (first: Deal, second: Deal, key: SortKey) => {
  const a = sortValue(first, key)
  const b = sortValue(second, key)
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))
}

const SortHeader = ({
  label,
  column,
  sort,
  onSort,
  className
}: {
  readonly label: string
  readonly column: SortKey
  readonly sort: { readonly key: SortKey; readonly descending: boolean }
  readonly onSort: (key: SortKey) => void
  readonly className: string
}) => {
  const Icon = sort.descending ? ChevronDown : ChevronUp
  return (
    <th
      scope="col"
      aria-sort={sort.key === column ? (sort.descending ? "descending" : "ascending") : "none"}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          sort.key === column ? "font-semibold text-foreground" : ""
        }`}
      >
        {label}
        {sort.key === column && <Icon className="size-3" strokeWidth={3} />}
      </button>
    </th>
  )
}

const BulkBar = ({
  pipeline,
  selected,
  onDone
}: {
  readonly pipeline: Pipeline
  readonly selected: ReadonlyArray<Deal>
  readonly onDone: () => void
}) => {
  const { agents, contacts, currency, saveDeal, removeDeal } = useCrm()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = selected.reduce((sum, deal) => sum + deal.amount, 0)

  const eachDeal = async (change: (deal: Deal) => Promise<BridgeResult<unknown>>) => {
    for (const deal of selected) {
      const result = await change(deal)
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
    }
    setError(null)
    onDone()
  }

  const exportCsv = () => {
    const header = ["Title", "Contact", "Stage", "Amount", "Chance", "Next step", "Closes", "Source"]
    const rows = selected.map((deal) => {
      const stage = stageOf(deal, pipeline)
      return [
        deal.title,
        contactLineOf(deal.contactId, contacts),
        stage?.name ?? "",
        deal.amount,
        chanceOf(deal, stage),
        deal.nextStep,
        deal.closeDate ?? "",
        deal.source
      ]
    })
    saveFile("deals.csv", toCsv([header, ...rows]))
  }

  return (
    <div
      role="toolbar"
      aria-label="Selected deals"
      className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-card border bg-muted py-1.5 pr-2 pl-4 shadow-xl"
    >
      <span className="whitespace-nowrap pr-3 text-[13px] font-semibold tabular-nums">
        {selected.length} selected · {money(total)} {currency}
      </span>
      {confirming ? (
        <>
          <span className="whitespace-nowrap px-2 text-[13px]">Delete them for good?</span>
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-destructive text-white hover:bg-destructive"
            onClick={() => void eachDeal((deal) => removeDeal(deal.id))}
          >
            Delete
          </Button>
        </>
      ) : (
        <>
          <select
            aria-label="Change owner"
            value=""
            onChange={(event) => {
              const ownerId = agents.find((agent) => agent.id === event.target.value)?.id ?? null
              void eachDeal((deal) => saveDeal({ ...toDealDetails(deal), ownerId }, deal.id))
            }}
            className="h-8 max-w-32 rounded-control-sm bg-transparent px-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Change owner
            </option>
            {ownerOptions(agents).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Move to stage"
            value=""
            onChange={(event) => {
              const stage = pipeline.stages.find((item) => item.id === event.target.value)
              if (stage !== undefined) {
                void eachDeal((deal) => saveDeal({ ...toDealDetails(deal), stageId: stage.id }, deal.id))
              }
            }}
            className="h-8 max-w-32 rounded-control-sm bg-transparent px-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Move to stage
            </option>
            {pipeline.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={exportCsv}>
            Export
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </>
      )}
      {error !== null && (
        <span role="alert" className="px-2 text-[13px] text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

const headerCell = "px-2 text-left text-xs font-medium text-muted-foreground"
const cell = "px-2 text-[13px]"

export const DealTable = ({
  pipeline,
  deals,
  onOpen
}: {
  readonly pipeline: Pipeline
  readonly deals: ReadonlyArray<Deal>
  readonly onOpen: (id: string) => void
}) => {
  const { agents, contacts, approvals, currency } = useCrm()
  const [sort, setSort] = useState<{ readonly key: SortKey; readonly descending: boolean }>({
    key: "amount",
    descending: true
  })
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())

  const sorted = [...deals].sort((first, second) => compare(first, second, sort.key) * (sort.descending ? -1 : 1))
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const rows = sorted.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const selected = deals.filter((deal) => selectedIds.has(deal.id))
  const allShown = rows.length > 0 && rows.every((deal) => selectedIds.has(deal.id))

  const toggle = (id: string) => {
    const next = new Set(selectedIds)
    if (!next.delete(id)) next.add(id)
    setSelectedIds(next)
  }
  const sortBy = (key: SortKey) => setSort({ key, descending: sort.key === key ? !sort.descending : key === "amount" })

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto border-t">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead className="sticky top-0 z-10 bg-field">
            <tr className="h-9 border-b">
              <th scope="col" className="w-12 pl-4 text-left">
                <Tick
                  checked={allShown}
                  label="Select all"
                  onChange={() => setSelectedIds(allShown ? new Set() : new Set(rows.map((deal) => deal.id)))}
                />
              </th>
              <SortHeader label="Deal" column="title" sort={sort} onSort={sortBy} className={headerCell} />
              <th scope="col" className={headerCell}>
                Company and contact
              </th>
              <th scope="col" className={headerCell}>
                Stage
              </th>
              <SortHeader
                label="Amount"
                column="amount"
                sort={sort}
                onSort={sortBy}
                className={`${headerCell} text-right`}
              />
              <th scope="col" className={headerCell}>
                Chance
              </th>
              <th scope="col" className={headerCell}>
                Owner
              </th>
              <th scope="col" className={headerCell}>
                Next step
              </th>
              <SortHeader
                label="Closes"
                column="closeDate"
                sort={sort}
                onSort={sortBy}
                className={`${headerCell} pr-4`}
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((deal) => {
              const stage = stageOf(deal, pipeline)
              const approval = approvals.find((item) => item.dealId === deal.id && item.status === "pending")
              return (
                <tr
                  key={deal.id}
                  onClick={() => onOpen(deal.id)}
                  className={`h-14 cursor-pointer border-b transition-colors duration-150 hover:bg-muted ${
                    selectedIds.has(deal.id) ? "bg-muted" : ""
                  }`}
                >
                  <td className="pl-4">
                    <Tick
                      checked={selectedIds.has(deal.id)}
                      label={`Select ${deal.title}`}
                      onChange={() => toggle(deal.id)}
                    />
                  </td>
                  <td className="px-2 text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => onOpen(deal.id)}
                      className="text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {deal.title}
                    </button>
                  </td>
                  <td className={`${cell} text-muted-foreground`}>{contactLineOf(deal.contactId, contacts)}</td>
                  <td className={cell}>{stage?.name}</td>
                  <td className="px-2 text-right text-sm font-semibold tabular-nums">{money(deal.amount)}</td>
                  <td className={`${cell} tabular-nums text-muted-foreground`}>{chanceOf(deal, stage)}%</td>
                  <td className={cell}>{agents.find((agent) => agent.id === deal.ownerId)?.name ?? "You"}</td>
                  <td
                    className={`${cell} ${approval === undefined ? "text-muted-foreground" : "font-medium text-amber-600 dark:text-amber-400"}`}
                  >
                    {approval?.title ?? deal.nextStep}
                  </td>
                  <td className={`${cell} pr-4 text-muted-foreground`}>{dayLabel(deal.closeDate)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">No deals match these filters.</p>}
      </div>

      <footer className="flex h-11 shrink-0 items-center justify-between border-t px-4 text-[13px] text-muted-foreground">
        <span>
          {sorted.length} deals · {money(deals.reduce((sum, deal) => sum + deal.amount, 0))} {currency}
        </span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Previous
          </button>
          Page {current + 1} of {pages}
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Next
          </button>
        </span>
      </footer>

      {selected.length > 0 && (
        <BulkBar pipeline={pipeline} selected={selected} onDone={() => setSelectedIds(new Set())} />
      )}
    </>
  )
}
