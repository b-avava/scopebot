import type { Appointment } from "@scope-bot/domain"
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react"

/** Times snap to this many minutes while a card is dragged. */
const SNAP_MINUTES = 15
/** A press that moves less than this is a click. */
const DRAG_PX = 4

/** Statuses a person can still move. */
export const MOVABLE = ["pending", "booked", "confirmed"]

/** Where a dragged card is now: which column, and its new start in minutes since midnight. */
export interface DragState {
  readonly appointment: Appointment
  readonly columnKey: string
  readonly minutes: number
  /** Set while the move is being saved, so the card stays where it was dropped. */
  readonly saving: boolean
}

interface Press {
  readonly appointment: Appointment
  readonly x: number
  readonly y: number
  /** How far below the card's top the pointer took hold of it, in minutes. */
  readonly grip: number
  readonly length: number
  started: boolean
}

/** The column under the pointer, and the y inside it. */
const columnAt = (x: number, y: number) => {
  const column = document
    .elementsFromPoint(x, y)
    .find(
      (element): element is HTMLElement => element instanceof HTMLElement && element.dataset.columnKey !== undefined
    )
  return column === undefined ? null : { key: column.dataset.columnKey ?? "", top: column.getBoundingClientRect().top }
}

/**
 * Drags appointment cards between times and columns. A short press stays a click.
 * The drop is handed over with the column and the start; the caller decides what it means.
 */
export const useCardDrag = (
  hours: { readonly from: number; readonly to: number },
  onDrop: (appointment: Appointment, columnKey: string, minutes: number) => Promise<void>
) => {
  const [drag, setDrag] = useState<DragState | null>(null)
  const press = useRef<Press | null>(null)
  const dragged = useRef(false)
  const latest = useRef<DragState | null>(null)

  const place = useCallback(
    (x: number, y: number, current: Press) => {
      const column = columnAt(x, y)
      if (column === null) return
      const raw = hours.from + (y - column.top) - current.grip
      const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES
      const minutes = Math.min(Math.max(snapped, hours.from), hours.to - current.length)
      const next = { appointment: current.appointment, columnKey: column.key, minutes, saving: false }
      latest.current = next
      setDrag(next)
    },
    [hours.from, hours.to]
  )

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = press.current
      if (current === null) return
      if (!current.started && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_PX) return
      current.started = true
      dragged.current = true
      place(event.clientX, event.clientY, current)
    }
    const up = () => {
      const current = press.current
      press.current = null
      const dropped = latest.current
      latest.current = null
      if (current === null || !current.started || dropped === null) return
      setDrag({ ...dropped, saving: true })
      void onDrop(dropped.appointment, dropped.columnKey, dropped.minutes).finally(() => setDrag(null))
    }
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || press.current === null) return
      press.current = null
      latest.current = null
      setDrag(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("keydown", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("keydown", cancel)
    }
  }, [place, onDrop])

  /** Takes hold of a card. `start` and `length` are in minutes; the card's top is at `start`. */
  const take = (event: ReactPointerEvent, appointment: Appointment, start: number, length: number) => {
    if (event.button !== 0 || !MOVABLE.includes(appointment.status)) return
    const column = columnAt(event.clientX, event.clientY)
    const grip = column === null ? 0 : event.clientY - column.top - (start - hours.from)
    press.current = { appointment, x: event.clientX, y: event.clientY, grip, length, started: false }
    dragged.current = false
  }

  /** True once after a drag, so the click that ends it does not open the card. */
  const swallowClick = () => {
    const was = dragged.current
    dragged.current = false
    return was
  }

  return { drag, take, swallowClick }
}
