import {
  type ActivityChat,
  type ActivityEntry,
  type ActivityFilter,
  type ActivityPage,
  type ActivityQuery,
  type Agent,
  type AgentAction,
  dayOf
} from "@scope-bot/domain"
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CircleAlert,
  MessageCircle,
  ScrollText,
  Search,
  Users
} from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { EmployeeAvatar } from "./Avatar.tsx"
import {
  authorOf,
  clock,
  countText,
  dayTitle,
  filterLabels,
  headlineOf,
  localZone,
  momentOf,
  type Period,
  periodStart,
  periods,
  placeOf,
  type StatusTone,
  statusOf,
  sublineOf,
  titleOf,
  tokensText,
  toolLabel
} from "./activityView.ts"
import { PanelClose } from "./CrmParts.tsx"
import { errorMessage } from "./hooks.ts"
import { TitleBar } from "./TitleBar.tsx"

const REFRESH_MS = 30_000
const SEARCH_DELAY_MS = 300

const sectionTitle = "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground"

const toneClass: Record<StatusTone, string> = {
  wait: "font-semibold text-amber-600 dark:text-amber-400",
  fail: "font-semibold text-destructive",
  agreed: "font-medium text-muted-foreground",
  declined: "font-medium text-muted-foreground"
}

const filterIcons: Record<ActivityFilter, ReactNode> = {
  reply: <MessageCircle className="size-4 text-muted-foreground" />,
  appointment: <CalendarDays className="size-4 text-muted-foreground" />,
  lookup: <Search className="size-4 text-muted-foreground" />,
  handoff: <Bell className="size-4 text-amber-600 dark:text-amber-400" />,
  failed: <CircleAlert className="size-4 text-destructive" />
}

const filters: ReadonlyArray<ActivityFilter> = ["reply", "appointment", "lookup", "handoff", "failed"]

const agentNameOf = (agents: ReadonlyArray<Agent>, id: string) =>
  agents.find((agent) => agent.id === id)?.name ?? "An employee"

/** The page of the log for the filters, with more pages read on, and read again every half minute. */
const useActivityLog = (query: ActivityQuery) => {
  const [page, setPage] = useState<ActivityPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [extraPages, setExtraPages] = useState(0)
  const key = JSON.stringify(query)

  const load = useCallback(async () => {
    const result = await window.scopeBot.listActivity(JSON.parse(key) as ActivityQuery)
    if (!result.ok) return setError(errorMessage(result.error))
    setError(null)
    setPage(result.value)
    setExtraPages(0)
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  // Waiting drafts and handoffs change on their own. A longer list stays as it is while someone reads it.
  useEffect(() => {
    if (extraPages > 0) return
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [load, extraPages])

  const loadMore = async () => {
    if (page?.next == null) return
    setLoadingMore(true)
    const result = await window.scopeBot.listActivity({ ...(JSON.parse(key) as ActivityQuery), after: page.next })
    setLoadingMore(false)
    if (!result.ok) return setError(errorMessage(result.error))
    setPage({ ...page, entries: [...page.entries, ...result.value.entries], next: result.value.next })
    setExtraPages((count) => count + 1)
  }

  return { page, error, loadingMore, loadMore }
}

const SidebarRow = ({
  icon,
  label,
  count,
  active,
  countTone = "text-muted-foreground",
  onSelect
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly count: number
  readonly active: boolean
  readonly countTone?: string
  readonly onSelect: () => void
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onSelect}
    className={`flex h-9 shrink-0 items-center gap-2.5 rounded-control-sm px-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "bg-muted" : "hover:bg-muted"
    }`}
  >
    <span className="flex size-[22px] shrink-0 items-center justify-center">{icon}</span>
    <span className={`flex-1 truncate text-[13px] ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
    <span className={`text-xs tabular-nums ${countTone}`}>{count}</span>
  </button>
)

const Sidebar = ({
  agents,
  page,
  agentId,
  filter,
  search,
  onAgent,
  onFilter,
  onSearch
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly page: ActivityPage | null
  readonly agentId: string | null
  readonly filter: ActivityFilter | null
  readonly search: string
  readonly onAgent: (id: string | null) => void
  readonly onFilter: (filter: ActivityFilter | null) => void
  readonly onSearch: (text: string) => void
}) => {
  const counts = page?.counts
  const countOf = (id: string) => counts?.agents.find((item) => item.agentId === id)?.count ?? 0
  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-1 overflow-y-auto border-r p-3">
      <label className="mb-3 flex h-9 shrink-0 items-center gap-2 rounded-control border bg-field px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Find a client or action"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="flex flex-col gap-0.5">
        <span className={`px-2.5 pb-1.5 ${sectionTitle}`}>EMPLOYEES</span>
        <SidebarRow
          icon={<Users className="size-4" />}
          label="Everyone"
          count={counts?.total ?? 0}
          active={agentId === null}
          onSelect={() => onAgent(null)}
        />
        {agents.map((agent) => (
          <SidebarRow
            key={agent.id}
            icon={<EmployeeAvatar agent={agent} size={22} />}
            label={agent.name}
            count={countOf(agent.id)}
            active={agentId === agent.id}
            onSelect={() => onAgent(agentId === agent.id ? null : agent.id)}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-col gap-0.5 border-t pt-3">
        <span className={`px-2.5 pb-1.5 ${sectionTitle}`}>WHAT THEY DID</span>
        {filters.map((item) => (
          <SidebarRow
            key={item}
            icon={filterIcons[item]}
            label={filterLabels[item]}
            count={counts?.kinds[item] ?? 0}
            active={filter === item}
            {...(item === "failed" ? { countTone: "text-destructive" } : {})}
            onSelect={() => onFilter(filter === item ? null : item)}
          />
        ))}
      </div>
    </aside>
  )
}

const Toolbar = ({
  failedOnly,
  period,
  onPeriod
}: {
  readonly failedOnly: boolean
  readonly period: Period
  readonly onPeriod: (period: Period) => void
}) => (
  <div className="flex shrink-0 items-center gap-4 border-b px-6 pt-[18px] pb-4">
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <h1 className="text-2xl leading-[30px] font-bold tracking-tight">
        {failedOnly ? "What didn't work" : "What employees did"}
      </h1>
      <p className="text-[13px] text-muted-foreground">
        {failedOnly
          ? "Steps employees couldn't finish, and what the client got instead."
          : "Every step an AI employee took, as it happened. Records can't be changed or deleted."}
      </p>
    </div>
    <fieldset
      aria-label="Period"
      className="m-0 flex min-w-0 shrink-0 items-center gap-0.5 rounded-control border bg-field p-[3px]"
    >
      {periods.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={period === item.value}
          onClick={() => onPeriod(item.value)}
          className={`h-7 rounded-[9px] px-3 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
            period === item.value ? "bg-muted font-semibold" : "font-medium text-muted-foreground hover:text-foreground"
          }`}
        >
          {item.label}
        </button>
      ))}
    </fieldset>
  </div>
)

const Row = ({
  entry,
  agent,
  selected,
  tinted,
  onOpen
}: {
  readonly entry: ActivityEntry
  readonly agent: Agent | undefined
  readonly selected: boolean
  /** Failed rows stand out, unless the list shows only those. */
  readonly tinted: boolean
  readonly onOpen: () => void
}) => {
  const headline = headlineOf(entry, agent?.name ?? "An employee")
  const status = statusOf(entry)
  const failed = entry.action.status === "failed"
  const look = selected
    ? failed
      ? "border-destructive/40 bg-destructive/10"
      : "border-transparent bg-muted"
    : failed && tinted
      ? "border-transparent bg-destructive/[0.06] hover:bg-destructive/10"
      : "border-transparent hover:bg-muted/60"
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onOpen}
      className={`flex shrink-0 items-center gap-3.5 rounded-card border px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${look}`}
    >
      <span className="w-11 shrink-0 text-[13px] font-medium text-muted-foreground tabular-nums">
        {clock(entry.action.createdAt)}
      </span>
      <span className="flex size-[22px] shrink-0 items-center justify-center">
        {agent === undefined ? (
          <span className="size-[22px] rounded-full bg-muted" />
        ) : (
          <EmployeeAvatar agent={agent} size={22} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm">
          <span className="font-semibold">{headline.who}</span> {headline.what}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">{sublineOf(entry, headline)}</span>
      </span>
      <span className="flex w-[160px] shrink-0 items-center justify-end gap-1.5 text-xs">
        {status !== null && (
          <>
            {status.tone === "agreed" && <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />}
            <span className={toneClass[status.tone]}>{status.text}</span>
          </>
        )}
      </span>
    </button>
  )
}

const DayHeader = ({
  day,
  today,
  counted,
  failedOnly
}: {
  readonly day: string
  readonly today: string
  readonly counted: { readonly total: number; readonly failed: number } | undefined
  readonly failedOnly: boolean
}) => (
  <div className="flex items-baseline gap-2.5 px-3 pt-4 pb-2 first:pt-4 [&:not(:first-child)]:pt-6">
    <span className="text-[15px] font-bold">{dayTitle(day, today)}</span>
    {counted !== undefined && (
      <span className="text-[13px] text-muted-foreground">
        {failedOnly
          ? `${counted.failed} didn't work`
          : [countText(counted.total, "action"), counted.failed > 0 ? `${counted.failed} didn't work` : ""]
              .filter((part) => part !== "")
              .join(" · ")}
      </span>
    )}
  </div>
)

const EmptyLog = ({ filtered }: { readonly filtered: boolean }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6 pb-[120px] text-center">
    <span className="flex size-14 items-center justify-center rounded-card border bg-field">
      <ScrollText className="size-6 text-muted-foreground" />
    </span>
    <span className="text-lg font-bold">{filtered ? "Nothing matches" : "Nothing here yet"}</span>
    <span className="max-w-[400px] text-sm text-muted-foreground">
      {filtered
        ? "Try another employee, kind or period, or clear the search."
        : "When an employee answers a client, books a visit or hands a chat to a person, it shows up here with what started it."}
    </span>
  </div>
)

const Section = ({ title, children }: { readonly title: string; readonly children: ReactNode }) => (
  <div className="flex flex-col gap-2.5">
    <span className={sectionTitle}>{title}</span>
    {children}
  </div>
)

const Detail = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <div className="flex gap-3 text-[13px]">
    <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 flex-1">{children}</span>
  </div>
)

/** Everything done in reply to the same message, oldest first. */
const useSteps = (id: string) => {
  const [steps, setSteps] = useState<ReadonlyArray<AgentAction> | null>(null)
  useEffect(() => {
    let current = true
    void window.scopeBot.listActionSteps(id).then((result) => {
      if (current) setSteps(result.ok ? result.value : [])
    })
    return () => {
      current = false
    }
  }, [id])
  return steps
}

const PanelHead = ({
  entry,
  agent,
  zone,
  onClose
}: {
  readonly entry: ActivityEntry
  readonly agent: Agent | undefined
  readonly zone: string
  readonly onClose: () => void
}) => {
  const agentName = agent?.name ?? "An employee"
  const headline = headlineOf(entry, agentName)
  const status = statusOf(entry)
  const failed = entry.action.status === "failed"
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {agent !== undefined && <EmployeeAvatar agent={agent} size={22} />}
        <span className="flex-1 text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">{agentName}</span> ·{" "}
          {momentOf(entry.action.createdAt, zone, new Date())}
        </span>
        <PanelClose onClose={onClose} />
      </div>
      <h2 className="text-[22px] leading-7 font-bold tracking-tight">
        {headline.who === agentName ? titleOf(headline) : `${headline.who} ${headline.what}`}
      </h2>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        {failed ? (
          <CircleAlert className="size-3.5 text-destructive" strokeWidth={2.5} />
        ) : (
          <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
        )}
        <span className={`font-semibold ${failed ? "text-destructive" : "text-emerald-500"}`}>
          {failed ? "Didn't work" : "Done"}
        </span>
        {status?.tone === "wait" && <span className={toneClass.wait}>· {status.text}</span>}
      </div>
    </div>
  )
}

const chatLink = (entry: ActivityEntry, chat: ActivityChat) =>
  entry.action.status === "failed" && chat.channel !== null && chat.contactName !== null
    ? `Answer ${chat.contactName.split(" ")[0]} in the chat`
    : "Open the chat"

const StartedBy = ({
  entry,
  agentName,
  onOpenChat
}: {
  readonly entry: ActivityEntry
  readonly agentName: string
  readonly onOpenChat: (chat: ActivityChat) => void
}) => {
  const { trigger, chat } = entry
  const where = placeOf(entry)
  return (
    <Section title="WHAT STARTED IT">
      {trigger !== null && (
        <div className="flex flex-col gap-1.5 rounded-card border bg-field px-3.5 py-3">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{authorOf(entry, agentName)}</span>
            {where === null ? "" : ` · ${where}`} · {clock(trigger.createdAt)}
          </span>
          <span className="text-sm whitespace-pre-wrap">{trigger.text === "" ? "A photo" : trigger.text}</span>
        </div>
      )}
      {chat !== null && (
        <button
          type="button"
          onClick={() => onOpenChat(chat)}
          className="flex items-center gap-1.5 self-start rounded-sm text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {chatLink(entry, chat)}
          <ArrowRight className="size-3.5" />
        </button>
      )}
    </Section>
  )
}

const Steps = ({
  steps,
  current,
  chat,
  agents
}: {
  readonly steps: ReadonlyArray<AgentAction>
  readonly current: string
  readonly chat: ActivityChat | null
  readonly agents: ReadonlyArray<Agent>
}) => (
  <Section title="HOW IT WENT">
    <ol className="flex flex-col gap-3">
      {steps.map((step) => {
        const line = headlineOf({ action: step, chat }, agentNameOf(agents, step.agentId))
        const weight = step.id === current ? "font-semibold" : ""
        const tone = step.status === "failed" ? "text-destructive" : ""
        return (
          <li key={step.id} className="flex gap-3 text-[13px]">
            <span className="w-10 shrink-0 text-muted-foreground tabular-nums">{clock(step.createdAt)}</span>
            <span className={`min-w-0 flex-1 ${weight} ${tone}`}>
              {line.who} {line.what}
            </span>
          </li>
        )
      })}
    </ol>
  </Section>
)

const Details = ({ action }: { readonly action: AgentAction }) => (
  <div className="mt-auto flex flex-col gap-2.5 border-t pt-5">
    <span className={sectionTitle}>DETAILS</span>
    <Detail label="Step">{toolLabel(action.tool)}</Detail>
    {action.decidedBy !== undefined && (
      <Detail label="Decided by">
        {action.decidedBy.name}, {action.decidedBy.agreed ? "agreed" : "turned it down"}
      </Detail>
    )}
    <Detail label="Model">{action.model === "" ? "None" : action.model}</Detail>
    <Detail label="Tokens">{tokensText(action)}</Detail>
    <Detail label="Record">
      <span className="text-muted-foreground">{action.id.slice(0, 8)} · can't be changed</span>
    </Detail>
  </div>
)

/** One action: why, what started it, every step of that turn, and the record itself. */
const ActionPanel = ({
  entry,
  agents,
  zone,
  onClose,
  onOpenChat
}: {
  readonly entry: ActivityEntry
  readonly agents: ReadonlyArray<Agent>
  readonly zone: string
  readonly onClose: () => void
  readonly onOpenChat: (agentId: string, chat: ActivityChat) => void
}) => {
  const { action } = entry
  const agent = agents.find((item) => item.id === action.agentId)
  const agentName = agent?.name ?? "An employee"
  const steps = useSteps(action.id)

  return (
    <aside
      aria-label="Action"
      className="absolute top-0 right-0 bottom-0 z-10 flex w-[440px] flex-col gap-6 overflow-y-auto border-l bg-background px-6 pt-5 pb-6 shadow-[-24px_0_48px_rgba(0,0,0,0.25)]"
    >
      <PanelHead entry={entry} agent={agent} zone={zone} onClose={onClose} />
      {action.reason !== undefined && (
        <Section title="WHY">
          <p className="border-l-2 pl-3 text-sm">{action.reason}</p>
          <span className="text-xs text-muted-foreground">In {agentName}'s own words</span>
        </Section>
      )}
      {(entry.trigger !== null || entry.chat !== null) && (
        <StartedBy entry={entry} agentName={agentName} onOpenChat={(chat) => onOpenChat(action.agentId, chat)} />
      )}
      {steps !== null && steps.length > 1 && (
        <Steps steps={steps} current={action.id} chat={entry.chat} agents={agents} />
      )}
      <Details action={action} />
    </aside>
  )
}

/** Entries of one day each, in the order they came. */
const byDay = (entries: ReadonlyArray<ActivityEntry>, zone: string) => {
  const groups: Array<{ readonly day: string; readonly entries: Array<ActivityEntry> }> = []
  for (const entry of entries) {
    const day = dayOf(new Date(entry.action.createdAt), zone)
    const group = groups.at(-1)
    if (group?.day === day) group.entries.push(entry)
    else groups.push({ day, entries: [entry] })
  }
  return groups
}

const Feed = ({
  page,
  agents,
  zone,
  openId,
  failedOnly,
  loadingMore,
  onOpen,
  onLoadMore
}: {
  readonly page: ActivityPage | null
  readonly agents: ReadonlyArray<Agent>
  readonly zone: string
  readonly openId: string | null
  readonly failedOnly: boolean
  readonly loadingMore: boolean
  readonly onOpen: (id: string | null) => void
  readonly onLoadMore: () => void
}) => {
  const today = dayOf(new Date(), zone)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-2 pb-6">
      {byDay(page?.entries ?? [], zone).map((group) => (
        <div key={group.day} className="flex flex-col">
          <DayHeader
            day={group.day}
            today={today}
            counted={page?.days.find((item) => item.day === group.day)}
            failedOnly={failedOnly}
          />
          {group.entries.map((entry) => (
            <Row
              key={entry.action.id}
              entry={entry}
              agent={agents.find((item) => item.id === entry.action.agentId)}
              selected={entry.action.id === openId}
              tinted={!failedOnly}
              onOpen={() => onOpen(entry.action.id === openId ? null : entry.action.id)}
            />
          ))}
        </div>
      ))}
      {page?.next != null && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="mt-3 self-center rounded-control border px-4 py-2 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Show earlier"}
        </button>
      )}
    </div>
  )
}

const ActivityTitleBar = () => (
  <TitleBar>
    <span className="text-sm font-semibold">Activity log</span>
  </TitleBar>
)

/** The search is sent once the person stops typing. */
const useSettled = (text: string) => {
  const [settled, setSettled] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])
  return settled
}

/**
 * What every AI employee did, newest first, with what started it and what still
 * waits. Owners and admins see it; tabs of other people stay out (ADR 0022).
 */
export const ActivityScreen = ({
  agents,
  onOpenChat
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly onOpenChat: (agentId: string, chat: ActivityChat) => void
}) => {
  const zone = useMemo(localZone, [])
  const [period, setPeriod] = useState<Period>("week")
  const [agentId, setAgentId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ActivityFilter | null>(null)
  const [search, setSearch] = useState("")
  const searched = useSettled(search)
  const [openId, setOpenId] = useState<string | null>(null)
  // The period starts at midnight, so it is worked out again only when it changes.
  const from = useMemo(() => periodStart(period, new Date()), [period])

  const query: ActivityQuery = {
    from,
    timeZone: zone,
    ...(agentId === null ? {} : { agentId: agentId as Agent["id"] }),
    ...(filter === null ? {} : { filter }),
    ...(searched === "" ? {} : { search: searched })
  }
  const { page, error, loadingMore, loadMore } = useActivityLog(query)
  const open = page?.entries.find((entry) => entry.action.id === openId)
  const empty = page !== null && page.entries.length === 0

  return (
    <>
      <ActivityTitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          agents={agents}
          page={page}
          agentId={agentId}
          filter={filter}
          search={search}
          onAgent={setAgentId}
          onFilter={setFilter}
          onSearch={setSearch}
        />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <Toolbar failedOnly={filter === "failed"} period={period} onPeriod={setPeriod} />
          {error !== null && <p className="px-6 pt-3 text-sm text-destructive">{error}</p>}
          {empty ? (
            <EmptyLog filtered={agentId !== null || filter !== null || searched !== ""} />
          ) : (
            <Feed
              page={page}
              agents={agents}
              zone={zone}
              openId={openId}
              failedOnly={filter === "failed"}
              loadingMore={loadingMore}
              onOpen={setOpenId}
              onLoadMore={() => void loadMore()}
            />
          )}
          {open !== undefined && (
            <ActionPanel
              key={open.action.id}
              entry={open}
              agents={agents}
              zone={zone}
              onClose={() => setOpenId(null)}
              onOpenChat={onOpenChat}
            />
          )}
        </div>
      </div>
    </>
  )
}
