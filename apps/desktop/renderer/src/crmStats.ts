import type {
  Activity,
  Contact,
  ContactDetails,
  Deal,
  DealDetails,
  Pipeline,
  Service,
  ServiceDetails,
  Stage
} from "@scope-bot/domain"

const DAY_MS = 24 * 60 * 60 * 1000

export const money = (amount: number) => amount.toLocaleString("en-US", { maximumFractionDigits: 2 })

/** The chance of a deal in percent: its own, or the usual one of its stage. */
export const chanceOf = (deal: Deal, stage: Stage | undefined) => deal.probability ?? stage?.probability ?? 0

export const stageOf = (deal: Deal, pipeline: Pipeline | undefined) =>
  pipeline?.stages.find((stage) => stage.id === deal.stageId)

const median = (values: ReadonlyArray<number>) => {
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return null
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

export interface DealSummary {
  readonly openAmount: number
  readonly openCount: number
  readonly weighted: number
  readonly wonThisMonth: number
  /** Empty until a deal has closed. */
  readonly winRate: number | null
  readonly medianDays: number | null
}

/** Computed from the deals themselves, so the numbers cannot drift from the board. */
export const summarizeDeals = (deals: ReadonlyArray<Deal>, pipeline: Pipeline | undefined, now: Date): DealSummary => {
  const withStage = deals.map((deal) => ({ deal, stage: stageOf(deal, pipeline) }))
  const open = withStage.filter(({ stage }) => stage?.kind === "open")
  const won = withStage.filter(({ stage }) => stage?.kind === "won")
  const lost = withStage.filter(({ stage }) => stage?.kind === "lost")
  const closed = [...won, ...lost]
  const thisMonth = won.filter(({ deal }) => {
    const closedAt = new Date(deal.closedAt ?? deal.stageChangedAt)
    return closedAt.getFullYear() === now.getFullYear() && closedAt.getMonth() === now.getMonth()
  })

  return {
    openAmount: open.reduce((sum, { deal }) => sum + deal.amount, 0),
    openCount: open.length,
    weighted: Math.round(open.reduce((sum, { deal, stage }) => sum + (deal.amount * chanceOf(deal, stage)) / 100, 0)),
    wonThisMonth: thisMonth.reduce((sum, { deal }) => sum + deal.amount, 0),
    winRate: closed.length === 0 ? null : Math.round((won.length / closed.length) * 100),
    medianDays: median(
      won.map(({ deal }) =>
        Math.round((Date.parse(deal.closedAt ?? deal.stageChangedAt) - Date.parse(deal.createdAt)) / DAY_MS)
      )
    )
  }
}

export interface DealFilters {
  readonly search: string
  /** `all`, `you` for a person, or an employee id. */
  readonly owner: string
  readonly closes: "any" | "month" | "quarter" | "overdue"
  readonly source: string
}

export const noDealFilters: DealFilters = { search: "", owner: "all", closes: "any", source: "all" }

const sameQuarter = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() && Math.floor(first.getMonth() / 3) === Math.floor(second.getMonth() / 3)

const matchesCloses = (deal: Deal, closes: DealFilters["closes"], now: Date) => {
  if (closes === "any") return true
  if (deal.closeDate === null) return false
  const date = new Date(deal.closeDate)
  if (closes === "overdue") return date.getTime() < now.getTime() && deal.closedAt === null
  if (closes === "quarter") return sameQuarter(date, now)
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

const matchesOwner = (deal: Deal, owner: string) => {
  if (owner === "all") return true
  return owner === "you" ? deal.ownerId === null : deal.ownerId === owner
}

export const filterDeals = (
  deals: ReadonlyArray<Deal>,
  filters: DealFilters,
  contactLine: (deal: Deal) => string,
  now: Date
) => {
  const search = filters.search.trim().toLowerCase()
  return deals.filter(
    (deal) =>
      (search === "" || `${deal.title} ${contactLine(deal)}`.toLowerCase().includes(search)) &&
      matchesOwner(deal, filters.owner) &&
      matchesCloses(deal, filters.closes, now) &&
      (filters.source === "all" || deal.source === filters.source)
  )
}

/** "Northwind · Anna Kiknadze" for a person at a company. */
export const contactLineOf = (contactId: Deal["contactId"], contacts: ReadonlyArray<Contact>) => {
  const contact = contacts.find((item) => item.id === contactId)
  if (contact === undefined) return ""
  const company = contacts.find((item) => item.id === contact.companyId)
  return company === undefined ? contact.name : `${company.name} · ${contact.name}`
}

const channelKeys = (contact: Contact) =>
  [contact.channels.phone, contact.channels.whatsapp, contact.channels.telegram]
    .map((channel) => channel.toLowerCase().replace(/[^0-9a-z_]/g, ""))
    .filter((key) => key !== "")

/** The contacts that share a phone, a WhatsApp number or a Telegram name with another contact. */
export const duplicateIds = (contacts: ReadonlyArray<Contact>) => {
  const owners = new Map<string, Set<string>>()
  for (const contact of contacts) {
    for (const key of channelKeys(contact)) owners.set(key, (owners.get(key) ?? new Set()).add(contact.id))
  }
  return new Set([...owners.values()].filter((ids) => ids.size > 1).flatMap((ids) => [...ids]))
}

export interface ServiceSales {
  readonly sold: number
  readonly revenue: number
}

/** Won deals in the period. A deal with several services counts equally towards each of them. */
export const salesOf = (
  service: Service,
  deals: ReadonlyArray<Deal>,
  pipeline: Pipeline | undefined,
  now: Date,
  days: number
): ServiceSales => {
  const since = now.getTime() - days * DAY_MS
  const sales = deals.filter(
    (deal) =>
      deal.serviceIds.includes(service.id) &&
      stageOf(deal, pipeline)?.kind === "won" &&
      Date.parse(deal.closedAt ?? deal.stageChangedAt) >= since
  )
  return {
    sold: sales.length,
    revenue: Math.round(sales.reduce((sum, deal) => sum + deal.amount / deal.serviceIds.length, 0))
  }
}

export const priceLabel = (service: ServiceDetails) => {
  if (service.price === null) return null
  const amount = money(service.price)
  return { fixed: amount, from: `from ${amount}`, hourly: `${amount} /h`, monthly: `${amount} /mo` }[service.pricing]
}

const csvCell = (value: string | number) => {
  const text = String(value)
  // A leading sign would run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export const toCsv = (rows: ReadonlyArray<ReadonlyArray<string | number>>) =>
  rows.map((row) => row.map(csvCell).join(",")).join("\n")

export const dayLabel = (date: string | null) =>
  date === null ? "" : new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

/** Newest first, grouped under "Today", "Yesterday" or a date. */
export const groupByDay = (items: ReadonlyArray<Activity>, now: Date) => {
  const label = (iso: string) => {
    const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / DAY_MS)
    if (days <= 0) return "Today"
    return days === 1 ? "Yesterday" : dayLabel(iso)
  }
  const groups = new Map<string, Array<Activity>>()
  const newestFirst = [...items].sort((first, second) => second.createdAt.localeCompare(first.createdAt))
  for (const item of newestFirst) {
    const key = label(item.createdAt)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
}

export const toContactDetails = ({
  id: _id,
  summary: _summary,
  createdAt: _createdAt,
  ...details
}: Contact): ContactDetails => details

export const toDealDetails = ({
  id: _id,
  createdAt: _createdAt,
  stageChangedAt: _stageChangedAt,
  closedAt: _closedAt,
  ...details
}: Deal): DealDetails => details

export const toServiceDetails = ({ id: _id, createdAt: _createdAt, ...details }: Service): ServiceDetails => details
