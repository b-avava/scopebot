import type { ConversationSummary } from "@scope-bot/domain"
import { Plus, X } from "lucide-react"
import { useState } from "react"

interface ChatTabsProps {
  readonly tabs: ReadonlyArray<ConversationSummary>
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
  readonly onCreate: () => void
  readonly onRename: (id: string, title: string) => void
  readonly onClose: (tab: ConversationSummary) => void
}

const RenameField = ({
  title,
  onDone
}: {
  readonly title: string
  /** Null when the change is cancelled. */
  readonly onDone: (title: string | null) => void
}) => {
  const [value, setValue] = useState(title)
  const finish = () => onDone(value.trim() === "" ? null : value.trim())

  return (
    <input
      aria-label="Chat name"
      // biome-ignore lint/a11y/noAutofocus: the field only appears after a double click on the tab.
      autoFocus
      value={value}
      maxLength={60}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish()
        if (event.key === "Escape") onDone(null)
      }}
      className="h-8 w-36 rounded-lg border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

/** The chats of one employee. They differ by task and share one memory. */
export const ChatTabs = ({ tabs, activeId, onSelect, onCreate, onRename, onClose }: ChatTabsProps) => {
  const [renaming, setRenaming] = useState<string | null>(null)

  return (
    <div className="window-no-drag flex min-w-0 flex-1 items-center gap-1 pl-3">
      <div
        role="tablist"
        aria-label="Chats"
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((tab) =>
          tab.id === renaming ? (
            <RenameField
              key={tab.id}
              title={tab.title}
              onDone={(title) => {
                setRenaming(null)
                if (title !== null && title !== tab.title) onRename(tab.id, title)
              }}
            />
          ) : (
            <div
              key={tab.id}
              className={`group flex h-8 max-w-48 shrink-0 items-center rounded-lg transition-colors duration-150 ${
                tab.id === activeId ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === activeId}
                title="Double-click to rename"
                onClick={() => onSelect(tab.id)}
                onDoubleClick={() => setRenaming(tab.id)}
                className={`h-full min-w-0 truncate rounded-lg pl-2.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  tabs.length > 1 ? "pr-1" : "pr-2.5"
                }`}
              >
                {tab.title}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  onClick={() => onClose(tab)}
                  className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 outline-none transition-opacity duration-150 group-hover:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )
        )}
      </div>
      <button
        type="button"
        aria-label="New chat"
        onClick={onCreate}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
