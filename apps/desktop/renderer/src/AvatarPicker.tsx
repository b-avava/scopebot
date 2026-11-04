import {
  ColorSelector,
  ColorSelectorItem,
  ColorSelectorList
} from "@scope-bot/ui/components/motion/color-selector.tsx"
import type { AgentFace, AgentShape } from "@scope-bot/domain"
import { Check } from "lucide-react"
import type { ReactNode } from "react"
import { Mascot } from "./Mascot.tsx"
import { avatarColors, avatarFaces, avatarShapes } from "./sampleData.ts"

export interface AvatarLook {
  readonly shape: AgentShape
  readonly face: AgentFace
  readonly color: string
}

interface AvatarPickerProps {
  readonly value: AvatarLook
  readonly onChange: (look: AvatarLook) => void
  /** Smaller cells without labels, for narrow panels. */
  readonly compact?: boolean
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const Section = ({ title, current, children }: {
  readonly title: string
  readonly current: string
  readonly children: ReactNode
}) => (
  <section className="flex flex-col gap-2.5">
    <div className="flex items-center justify-between">
      <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
      <span className="text-[13px] font-medium">{current}</span>
    </div>
    {children}
  </section>
)

interface OptionProps {
  readonly label: string
  readonly selected: boolean
  readonly compact: boolean
  readonly onSelect: () => void
  readonly children: ReactNode
}

const Option = ({ label, selected, compact, onSelect, children }: OptionProps) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    aria-label={label}
    onClick={onSelect}
    className={`relative flex flex-col items-center gap-1.5 rounded-xl outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
      compact ? "py-2" : "px-1 py-3"
    } ${selected ? "bg-accent" : "hover:bg-muted"}`}
  >
    {children}
    {!compact && <span className="text-xs text-muted-foreground">{label}</span>}
    {selected && !compact && (
      <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )}
  </button>
)

export const AvatarPicker = ({ value, onChange, compact = false }: AvatarPickerProps) => {
  const thumbnail = compact ? 32 : 48

  return (
    <div className="flex flex-col gap-6">
      <Section title="Shape" current={titleCase(value.shape)}>
        <div role="radiogroup" aria-label="Shape" className="grid grid-cols-4 gap-1">
          {avatarShapes.map((shape) => (
            <Option
              key={shape}
              label={titleCase(shape)}
              selected={shape === value.shape}
              compact={compact}
              onSelect={() => onChange({ ...value, shape })}
            >
              <Mascot size={thumbnail} shape={shape} face={value.face} color={value.color} />
            </Option>
          ))}
        </div>
      </Section>

      <Section title="Face" current={titleCase(value.face)}>
        <div role="radiogroup" aria-label="Face" className="grid grid-cols-4 gap-1">
          {avatarFaces.map((face) => (
            <Option
              key={face}
              label={titleCase(face)}
              selected={face === value.face}
              compact={compact}
              onSelect={() => onChange({ ...value, face })}
            >
              <Mascot size={thumbnail} shape={value.shape} face={face} color={value.color} />
            </Option>
          ))}
        </div>
      </Section>

      <Section
        title="Colour"
        current={avatarColors.find((option) => option.value === value.color)?.label ?? ""}
      >
        <ColorSelector value={value.color} onValueChange={(color) => onChange({ ...value, color })} aria-label="Colour">
          <ColorSelectorList className="flex flex-wrap gap-2">
            {avatarColors.map((option) => (
              <ColorSelectorItem
                key={option.value}
                value={option.value}
                color={option.value}
                label={option.label}
                className="size-9"
              />
            ))}
          </ColorSelectorList>
        </ColorSelector>
      </Section>
    </div>
  )
}
