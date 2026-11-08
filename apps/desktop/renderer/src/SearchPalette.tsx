import type { Agent, SearchHit } from "@scope-bot/domain"
import { CornerDownLeft, Search } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react"
import { EmployeeAvatar } from "./Avatar.tsx"

const SEARCH_DELAY_MS = 120

const filters = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "chat", label: "Chats" },
  { value: "message", label: "Messages" }
] as const

type Filter = (typeof filters)[number]["value"]

const groups = [
  { kind: "agent", label: "Agents" },
  { kind: "chat", label: "Chats" },
  { kind: "message", label: "Messages" }
] as const

const Key = ({ children }: { readonly children: ReactNode }) => (
  <kbd className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 font-sans text-[11px] text-muted-foreground">
    {children}
  </kbd>
)

const Hint = ({ keys, label }: { readonly keys: ReadonlyArray<ReactNode>; readonly label: string }) => (
  <span className="flex items-center gap-1 text-xs text-muted-foreground">
    {keys.map((key, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the keys of a hint never change.
      <Key key={index}>{key}</Key>
    ))}
    <span className="ml-0.5">{label}</span>
  </span>
)

interface ResultGroupProps {
  readonly label: string
  readonly hits: ReadonlyArray<SearchHit>
  /** Every hit on screen, which is what the active index counts. */
  readonly visible: ReadonlyArray<SearchHit>
  readonly active: number
  readonly team: ReadonlyArray<Agent>
  readonly activeRow: RefObject<HTMLButtonElement | null>
  readonly onHover: (index: number) => void
  readonly onOpen: (hit: SearchHit) => void
}

const ResultGroup = ({ label, hits, visible, active, team, activeRow, onHover, onOpen }: ResultGroupProps) => {
  if (hits.length === 0) return null

  return (
    <section aria-label={label}>
      <div className="flex items-center justify-between px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{hits.length}</span>
      </div>
      {hits.map((hit) => {
        const index = visible.indexOf(hit)
        const agent = team.find((item) => item.id === hit.agentId)
        const selected = index === active
        return (
          <button
            key={`${hit.kind}-${hit.messageId ?? hit.conversationId ?? hit.agentId}`}
            ref={selected ? activeRow : undefined}
            type="button"
            tabIndex={-1}
            onClick={() => onOpen(hit)}
            onPointerMove={() => onHover(index)}
            className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm ${
              selected ? "bg-muted" : ""
            }`}
          >
            {agent !== undefined && (
              <span className="shrink-0">
                <EmployeeAvatar agent={agent} size={20} />
              </span>
            )}
            <span className="max-w-[45%] shrink-0 truncate font-medium">{hit.title}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{hit.detail}</span>
            {selected && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
          </button>
        )
      })}
    </section>
  )
}

interface SearchPaletteProps {
  readonly team: ReadonlyArray<Agent>
  readonly onOpen: (hit: SearchHit) => void
  readonly onClose: () => void
}

/** Finds employees and what is inside them. Rendered only while open. */
export const SearchPalette = ({ team, onOpen, onClose }: SearchPaletteProps) => {
  const reduce = useReducedMotion() ?? false
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [hits, setHits] = useState<ReadonlyArray<SearchHit>>([])
  const [active, setActive] = useState(0)
  const activeRow = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      void window.scopeBot.search(query).then((result) => {
        if (current && result.ok) setHits(result.value)
      })
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  const visible = hits.filter((hit) => filter === "all" || hit.kind === filter)

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: "nearest" })
  })

  const changeQuery = (next: string) => {
    setQuery(next)
    setActive(0)
  }

  const moveFilter = (step: number) => {
    const position = filters.findIndex((item) => item.value === filter)
    setFilter(filters[(position + step + filters.length) % filters.length]?.value ?? "all")
    setActive(0)
  }

  const open = (hit: SearchHit | undefined) => {
    if (hit !== undefined) onOpen(hit)
  }

  const shortcuts = new Map<string, (event: KeyboardEvent) => void>([
    ["ArrowDown", () => setActive((active + 1) % Math.max(visible.length, 1))],
    ["ArrowUp", () => setActive((active - 1 + visible.length) % Math.max(visible.length, 1))],
    ["Enter", () => open(visible[active])],
    ["Tab", (event) => moveFilter(event.shiftKey ? -1 : 1)],
    ["Escape", onClose]
  ])

  const handleKey = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && /^[1-9]$/.test(event.key)) {
      event.preventDefault()
      open(visible[Number(event.key) - 1])
      return
    }
    const shortcut = shortcuts.get(event.key)
    if (shortcut === undefined) return
    event.preventDefault()
    shortcut(event)
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/40 px-4 pt-[10vh] backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        role="dialog"
        aria-label="Search"
        aria-modal="true"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        onKeyDown={handleKey}
        className="flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-panel border bg-background shadow-xl"
      >
        <div className="flex items-center gap-2.5 border-b px-3.5 py-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            aria-label="Search"
            placeholder="Search"
            // biome-ignore lint/a11y/noAutofocus: a search palette exists to be typed in.
            autoFocus
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <div role="tablist" aria-label="Filter" className="flex shrink-0 items-center gap-0.5">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                tabIndex={-1}
                aria-selected={item.value === filter}
                onClick={() => {
                  setFilter(item.value)
                  setActive(0)
                }}
                className={`rounded-control-sm px-2 py-1 text-xs font-medium transition-colors duration-150 ${
                  item.value === filter ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing found</p>}
          {groups.map((group) => (
            <ResultGroup
              key={group.kind}
              label={group.label}
              hits={visible.filter((hit) => hit.kind === group.kind)}
              visible={visible}
              active={active}
              team={team}
              activeRow={activeRow}
              onHover={setActive}
              onOpen={onOpen}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3.5 py-2">
          <Hint keys={["↑", "↓"]} label="Move" />
          <Hint keys={["↵"]} label="Open" />
          <Hint keys={["Tab"]} label="Filter" />
          <Hint keys={["Ctrl", "1–9"]} label="Go to" />
          <Hint keys={["Esc"]} label="Close" />
        </div>
      </motion.div>
    </div>
  )
}
