import { Pin, PinOff, Settings, Trash2 } from "lucide-react"
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const EDGE_GAP = 8

export interface MenuPoint {
  readonly x: number
  readonly y: number
}

interface AgentMenuProps {
  readonly name: string
  readonly pinned: boolean
  /** Where the right click happened. */
  readonly at: MenuPoint
  readonly onClose: () => void
  readonly onPin: () => void
  readonly onSettings: () => void
  readonly onDelete: () => void
}

const itemClasses =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"

/** The context menu of an employee in the team list. */
export const AgentMenu = ({ name, pinned, at, onClose, onPin, onSettings, onDelete }: AgentMenuProps) => {
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(at)

  // A click near the window's edge must not push the menu out of sight.
  useLayoutEffect(() => {
    const size = menu.current?.getBoundingClientRect()
    if (size === undefined) return
    setPosition({
      x: Math.max(EDGE_GAP, Math.min(at.x, window.innerWidth - size.width - EDGE_GAP)),
      y: Math.max(EDGE_GAP, Math.min(at.y, window.innerHeight - size.height - EDGE_GAP))
    })
    menu.current?.querySelector("button")?.focus()
  }, [at])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener("pointerdown", closeOutside)
    window.addEventListener("blur", onClose)
    window.addEventListener("resize", onClose)
    return () => {
      window.removeEventListener("pointerdown", closeOutside)
      window.removeEventListener("blur", onClose)
      window.removeEventListener("resize", onClose)
    }
  }, [onClose])

  const choose = (action: () => void) => () => {
    onClose()
    action()
  }

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const items = [...(menu.current?.querySelectorAll("button") ?? [])]
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === "ArrowDown" ? 1 : -1
    items[(current + step + items.length) % items.length]?.focus()
  }

  return createPortal(
    <div
      ref={menu}
      role="menu"
      tabIndex={-1}
      aria-label={`Actions for ${name}`}
      onKeyDown={handleKey}
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 flex w-44 flex-col rounded-xl border bg-background p-1 shadow-lg"
    >
      <button type="button" role="menuitem" onClick={choose(onPin)} className={itemClasses}>
        {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        {pinned ? "Unpin" : "Pin"}
      </button>
      <button type="button" role="menuitem" onClick={choose(onSettings)} className={itemClasses}>
        <Settings className="size-4" />
        Settings
      </button>
      <button type="button" role="menuitem" onClick={choose(onDelete)} className={`${itemClasses} text-destructive`}>
        <Trash2 className="size-4" />
        Delete
      </button>
    </div>,
    document.body
  )
}
