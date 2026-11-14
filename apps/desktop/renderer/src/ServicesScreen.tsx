import type { Service } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { AttentionPill, FilterSelect, ownerOptions, SearchField, Tab } from "./CrmParts.tsx"
import { money, priceLabel, salesOf, toServiceDetails } from "./crmStats.ts"
import { errorMessage } from "./hooks.ts"
import { ServicePanel } from "./ServicePanel.tsx"
import { TitleBar } from "./TitleBar.tsx"

const quoteLabels = { auto: "Alone", approve: "After your OK", deny: "Never" } as const
const OTHER = "Other"

const categoryOf = (service: Service) => (service.category === "" ? OTHER : service.category)

const headerCell = "px-2 text-left text-xs font-medium text-muted-foreground"

type Editing = { readonly id: string } | "new" | null

export const ServicesScreen = () => {
  const { services, deals, pipelines, agents, online, failure, loaded, currency, saveService } = useCrm()
  const [category, setCategory] = useState("all")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [seller, setSeller] = useState("all")
  const [days, setDays] = useState("30")
  const [editing, setEditing] = useState<Editing>(null)
  const [onlyNoPrice, setOnlyNoPrice] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem = online ? failure : "offline"
  const pipeline = pipelines[0]
  const now = new Date()
  const categories = [...new Set(services.map(categoryOf))].sort()
  const noPrice = services.filter((service) => service.price === null && service.active)
  const needle = search.trim().toLowerCase()

  const shown = services.filter(
    (service) =>
      (category === "all" || categoryOf(service) === category) &&
      (needle === "" || `${service.name} ${service.description}`.toLowerCase().includes(needle)) &&
      (status === "all" || service.active === (status === "active")) &&
      (seller === "all" || service.sellerIds.length === 0 || service.sellerIds.some((id) => id === seller)) &&
      (!onlyNoPrice || service.price === null)
  )
  const sales = new Map(shown.map((service) => [service.id, salesOf(service, deals, pipeline, now, Number(days))]))
  const totals = [...sales.values()].reduce(
    (sum, item) => ({ sold: sum.sold + item.sold, revenue: sum.revenue + item.revenue }),
    { sold: 0, revenue: 0 }
  )
  const groups = [...new Set(shown.map(categoryOf))].sort()
  const open = editing !== null && editing !== "new" ? services.find((service) => service.id === editing.id) : undefined

  const setActive = async (service: Service, active: boolean) => {
    const result = await saveService({ ...toServiceDetails(service), active }, service.id)
    setError(result.ok ? null : errorMessage(result.error))
  }

  return (
    <>
      <TitleBar>
        <span className="text-sm font-semibold">Services</span>
        <div className="flex items-center gap-0.5 pl-2">
          <Tab active={category === "all"} onSelect={() => setCategory("all")}>
            All {services.length}
          </Tab>
          {categories.map((item) => (
            <Tab key={item} active={category === item} onSelect={() => setCategory(item)}>
              {item} {services.filter((service) => categoryOf(service) === item).length}
            </Tab>
          ))}
        </div>
        <div className="window-no-drag ml-auto">
          <Button size="sm" disabled={!online} onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            New service
          </Button>
        </div>
      </TitleBar>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SearchField value={search} placeholder="Search services" onChange={setSearch} />
          <FilterSelect
            label="Status"
            value={status}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "off", label: "Off" }
            ]}
            onChange={setStatus}
          />
          <FilterSelect
            label="Sold by"
            value={seller}
            options={[
              { value: "all", label: "Everyone" },
              ...ownerOptions(agents).filter((item) => item.value !== "you")
            ]}
            onChange={setSeller}
          />
          <FilterSelect
            label="Period"
            value={days}
            options={[
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
              { value: "365", label: "Last year" }
            ]}
            onChange={setDays}
          />
          {noPrice.length > 0 && (
            <div className="ml-auto">
              <AttentionPill onClick={() => setOnlyNoPrice(!onlyNoPrice)}>
                {onlyNoPrice ? "Show all services" : `${noPrice.length} without a price, employees will not quote them`}
              </AttentionPill>
            </div>
          )}
        </div>

        {(problem ?? error) !== null && (
          <p role="alert" className="px-4 pb-3 text-sm text-destructive">
            {error ?? (problem === null ? "" : errorMessage(problem))}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto border-t">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead className="sticky top-0 z-10 bg-field">
              <tr className="h-9 border-b">
                <th scope="col" className={`${headerCell} pl-4`}>
                  Service
                </th>
                <th scope="col" className={headerCell}>
                  Price
                </th>
                <th scope="col" className={headerCell}>
                  Takes
                </th>
                <th scope="col" className={headerCell}>
                  Employees may quote
                </th>
                <th scope="col" className={headerCell}>
                  Max discount
                </th>
                <th scope="col" className={headerCell}>
                  Sold
                </th>
                <th scope="col" className={headerCell}>
                  Revenue
                </th>
                <th scope="col" className={`${headerCell} pr-4`}>
                  Active
                </th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={8}
                    className="h-9 pl-4 text-left align-bottom pb-1.5 text-[13px] font-semibold"
                  >
                    {group}
                  </th>
                </tr>
                {shown
                  .filter((service) => categoryOf(service) === group)
                  .map((service) => {
                    const sale = sales.get(service.id)
                    const price = priceLabel(service)
                    return (
                      <tr
                        key={service.id}
                        onClick={() => setEditing({ id: service.id })}
                        className={`h-[52px] cursor-pointer border-b transition-colors duration-150 hover:bg-muted ${
                          open?.id === service.id ? "bg-muted" : ""
                        }`}
                      >
                        <td className="max-w-80 pl-4">
                          <button
                            type="button"
                            onClick={() => setEditing({ id: service.id })}
                            className={`block truncate text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              service.active ? "" : "text-muted-foreground"
                            }`}
                          >
                            {service.name}
                          </button>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {service.description}
                          </span>
                        </td>
                        <td className="px-2 text-sm font-semibold tabular-nums">
                          {price ?? (
                            <span className="text-[13px] font-medium text-amber-600 dark:text-amber-400">
                              Add a price
                            </span>
                          )}
                        </td>
                        <td className="px-2 text-[13px] text-muted-foreground">{service.duration}</td>
                        <td className="px-2 text-[13px]">{quoteLabels[service.quotePolicy]}</td>
                        <td className="px-2 text-[13px] text-muted-foreground">
                          {service.discountPolicy === "deny" || service.maxDiscountPercent === 0
                            ? "None"
                            : `${service.maxDiscountPercent}%`}
                        </td>
                        <td className="px-2 text-[13px] tabular-nums text-muted-foreground">{sale?.sold ?? 0}</td>
                        <td className="px-2 text-sm font-semibold tabular-nums">{money(sale?.revenue ?? 0)}</td>
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the switch has its own keys, this only keeps its click from opening the row. */}
                        <td className="px-2 pr-4" onClick={(event) => event.stopPropagation()}>
                          <Switch
                            ariaLabel={`${service.name} is active`}
                            checked={service.active}
                            onCheckedChange={(active) => void setActive(service, active)}
                          />
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            ))}
          </table>
          {problem === null && loaded && shown.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              {services.length === 0
                ? "No services yet. Employees quote only what is listed here, so add what you sell."
                : "No services match these filters."}
            </p>
          )}
        </div>

        <footer className="flex h-11 shrink-0 items-center justify-between border-t px-4 text-[13px] text-muted-foreground">
          <span>
            {services.length} services · {services.filter((service) => service.active).length} active
          </span>
          <span>
            {totals.sold} {totals.sold === 1 ? "sale" : "sales"} for {money(totals.revenue)} {currency}
          </span>
        </footer>

        {editing === "new" && (
          <ServicePanel service={null} onClose={() => setEditing(null)} onCreated={(id) => setEditing({ id })} />
        )}
        {open !== undefined && (
          <ServicePanel key={open.id} service={open} onClose={() => setEditing(null)} onCreated={() => undefined} />
        )}
      </div>
    </>
  )
}
