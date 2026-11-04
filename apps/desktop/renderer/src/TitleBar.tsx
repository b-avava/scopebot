import type { ReactNode } from "react"

/** Leaves room on the right for the window controls drawn by the OS. */
export const TitleBar = ({ children }: { readonly children: ReactNode }) => (
  <header className="window-drag flex h-12 shrink-0 items-center gap-2 border-b pr-36 pl-6">{children}</header>
)
