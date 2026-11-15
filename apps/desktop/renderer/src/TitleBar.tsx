import { createContext, type ReactNode, useContext, useState } from "react"
import { createPortal } from "react-dom"

const TitleBarSlot = createContext<HTMLElement | null>(null)

/** Puts a screen's title and controls into the row under the window strip. */
export const TitleBar = ({ children }: { readonly children: ReactNode }) => {
  const slot = useContext(TitleBarSlot)
  return slot === null ? null : createPortal(children, slot)
}

/**
 * The frame runs along the top and left of the window and holds everything
 * else. The thin strip on top carries the window controls drawn by the OS, so
 * its height matches `TITLE_BAR_HEIGHT` in main/index.ts. The row under it
 * belongs to the current screen and starts where the bots list ends.
 */
export const AppFrame = ({ children }: { readonly children: ReactNode }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  return (
    <TitleBarSlot.Provider value={slot}>
      <div className="flex h-svh w-full flex-col overflow-hidden bg-sidebar">
        <header className="window-drag shrink-0">
          <div className="window-strip flex h-[26px] items-center bg-(--title-strip) pl-3 text-xs text-muted-foreground">
            Scope Bot
          </div>
          <div ref={setSlot} className="flex h-10 items-center gap-2 pr-3 pl-[372px]" />
        </header>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </TitleBarSlot.Provider>
  )
}
