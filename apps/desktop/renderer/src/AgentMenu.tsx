import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger
} from "@scope-bot/ui/components/motion/popover-morph.tsx"
import { Ellipsis, Settings, Trash2 } from "lucide-react"
import { useState } from "react"

interface AgentMenuProps {
  readonly name: string
  readonly onSettings: () => void
  readonly onDelete: () => void
}

const itemClasses =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"

export const AgentMenu = ({ name, onSettings, onDelete }: AgentMenuProps) => {
  const [open, setOpen] = useState(false)

  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <MorphPopover open={open} onOpenChange={setOpen} className="absolute top-1/2 right-2 z-20 -translate-y-1/2">
      <MorphPopoverTrigger>
        <button
          type="button"
          aria-label={`Actions for ${name}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Ellipsis className="size-5" />
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent side="bottom" align="end" radius={12}>
        <div className="flex w-40 flex-col p-1">
          <button type="button" onClick={choose(onSettings)} className={itemClasses}>
            <Settings className="size-4" />
            Settings
          </button>
          <button type="button" onClick={choose(onDelete)} className={`${itemClasses} text-destructive`}>
            <Trash2 className="size-4" />
            Delete
          </button>
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  )
}
