import type { Agent, AgentRole, AgentSign, AgentState } from "@scope-bot/domain"
import { LensAvatar } from "@scope-bot/ui/components/avatar/LensAvatar.tsx"
import { ColorSelector, ColorSelectorItem, ColorSelectorList } from "@scope-bot/ui/components/motion/color-selector.tsx"
import { ChartColumn, Headset, type LucideIcon, Repeat, Tag } from "lucide-react"
import { createContext, useContext } from "react"

/** Amber and grey are left out: they already mean "waiting for you" and "paused". */
export const avatarColors = [
  { value: "#3B8BEB", label: "Blue" },
  { value: "#8A5CF0", label: "Purple" },
  { value: "#2FB5A0", label: "Teal" },
  { value: "#3CBF6E", label: "Green" },
  { value: "#F2772E", label: "Orange" },
  { value: "#E8404A", label: "Red" },
  { value: "#EC3F97", label: "Pink" },
  { value: "#8C5A3C", label: "Brown" }
] as const

export const defaultColor = "#3B8BEB"

export const signs: ReadonlyArray<{ readonly value: AgentSign; readonly label: string; readonly icon: LucideIcon }> = [
  { value: "tag", label: "Tag", icon: Tag },
  { value: "headset", label: "Headset", icon: Headset },
  { value: "repeat", label: "Repeat", icon: Repeat },
  { value: "chart", label: "Chart", icon: ChartColumn }
]

export const SignIcon = ({ sign, className }: { readonly sign: AgentSign | null; readonly className?: string }) => {
  const Icon = signs.find((item) => item.value === sign)?.icon
  return Icon === undefined ? null : <Icon className={className} />
}

export const roles: ReadonlyArray<{
  readonly value: AgentRole
  readonly label: string
  readonly description: string
}> = [
  { value: "sales", label: "Sales", description: "Answers about prices, asks you before discounts and payment links" },
  { value: "support", label: "Customer support", description: "Answers questions, hands upset customers to a person" },
  { value: "follow-ups", label: "Follow-ups", description: "Reminds customers and moves deals on. No discounts" },
  { value: "reports", label: "Reports", description: "Reads your data and writes summaries. Never messages customers" },
  { value: "blank", label: "Blank", description: "Asks you before anything risky. You set the rest" }
]

export const roleLabel = (role: AgentRole) => roles.find((item) => item.value === role)?.label ?? role

/** What the server says each employee is doing, by id. */
export const AgentStates = createContext<ReadonlyMap<string, AgentState>>(new Map())

/** Marks the area a live avatar watches the cursor in. */
export const watchArea = { "data-watch-area": true }

export const EmployeeAvatar = ({
  agent,
  size,
  live = false,
  greet = false
}: {
  readonly agent: Agent
  readonly size: number
  readonly live?: boolean
  readonly greet?: boolean
}) => {
  const states = useContext(AgentStates)
  // Pausing shows at once, without waiting for the next status from the server.
  const state = agent.active ? (states.get(agent.id) ?? "working") : "paused"
  return <LensAvatar color={agent.color} size={size} state={state} sign={agent.sign} live={live} greet={greet} />
}

export const ColorPicker = ({
  value,
  onChange
}: {
  readonly value: string
  readonly onChange: (color: string) => void
}) => {
  // An employee with an older colour keeps it selected.
  const colors = avatarColors.some((option) => option.value === value)
    ? avatarColors
    : [{ value, label: "Current" }, ...avatarColors]

  return (
    <ColorSelector value={value} onValueChange={onChange} aria-label="Colour" className="w-full">
      <ColorSelectorList className="flex flex-wrap justify-center gap-1.5">
        {colors.map((option) => (
          <ColorSelectorItem
            key={option.value}
            value={option.value}
            color={option.value}
            label={option.label}
            className="size-8"
          />
        ))}
      </ColorSelectorList>
    </ColorSelector>
  )
}

/** The sign on the avatar, or none. */
export const SignPicker = ({
  value,
  onChange
}: {
  readonly value: AgentSign | null
  readonly onChange: (sign: AgentSign | null) => void
}) => (
  <fieldset aria-label="Sign on the avatar" className="flex gap-2">
    {[...signs, { value: null, label: "None", icon: null }].map((option) => (
      <label
        key={option.label}
        title={option.label}
        className={`flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-control px-2 transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ring ${
          option.value === value
            ? "border-[1.5px] border-foreground bg-field"
            : "border text-muted-foreground hover:bg-muted"
        }`}
      >
        <input
          type="radio"
          name="avatar-sign"
          aria-label={option.label}
          checked={option.value === value}
          onChange={() => onChange(option.value)}
          className="sr-only"
        />
        {option.icon === null ? <span className="text-xs">None</span> : <option.icon className="size-4" />}
      </label>
    ))}
  </fieldset>
)
