import { Pin, PinOff, Settings, Trash2 } from "lucide-react"
import { Menu, type MenuPoint } from "./Menu.tsx"

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

/** The context menu of an employee in the team list. */
export const AgentMenu = ({ name, pinned, at, onClose, onPin, onSettings, onDelete }: AgentMenuProps) => (
  <Menu
    label={`Actions for ${name}`}
    at={at}
    onClose={onClose}
    items={[
      { label: pinned ? "Unpin" : "Pin", icon: pinned ? PinOff : Pin, onSelect: onPin },
      { label: "Settings", icon: Settings, onSelect: onSettings },
      { label: "Delete", icon: Trash2, danger: true, onSelect: onDelete }
    ]}
  />
)
