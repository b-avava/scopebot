import type { LucideIcon } from "lucide-react"
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const EDGE_GAP = 8

export interface MenuPoint {
  readonly x: number
  readonly y: number
}

export interface MenuItem {
  readonly label: string
  readonly icon: LucideIcon
  readonly danger?: boolean
  readonly onSelect: () => void
}

interface MenuProps {
  /** Names the menu for screen readers. */
  readonly label: string
  readonly at: MenuPoint
  readonly items: ReadonlyArray<MenuItem>
  readonly onClose: () => void
}

const itemClasses =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"

/** A small menu that opens at a point on the screen. */
export const Menu = ({ label, at, items, onClose }: MenuProps) => {
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

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const buttons = [...(menu.current?.querySelectorAll("button") ?? [])]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const step = event.key === "ArrowDown" ? 1 : -1
    buttons[(current + step + buttons.length) % buttons.length]?.focus()
  }

  return createPortal(
    <div
      ref={menu}
      role="menu"
      tabIndex={-1}
      aria-label={label}
      onKeyDown={handleKey}
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 flex w-48 flex-col rounded-control border bg-background p-1 shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            item.onSelect()
          }}
          className={`${itemClasses} ${item.danger === true ? "text-destructive" : ""}`}
        >
          <item.icon className="size-4" />
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
