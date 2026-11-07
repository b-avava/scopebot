import type { AgentFace, AgentShape } from "@scope-bot/domain"
import { ColorSelector, ColorSelectorItem, ColorSelectorList } from "@scope-bot/ui/components/motion/color-selector.tsx"
import { Mascot } from "./Mascot.tsx"
import { avatarCharacters, avatarColors } from "./sampleData.ts"

export interface AvatarLook {
  readonly shape: AgentShape
  readonly face: AgentFace
  readonly color: string
}

interface AvatarPickerProps {
  readonly value: AvatarLook
  readonly onChange: (look: AvatarLook) => void
}

export const AvatarPicker = ({ value, onChange }: AvatarPickerProps) => {
  const isCurrent = (character: Pick<AvatarLook, "shape" | "face">) =>
    character.shape === value.shape && character.face === value.face
  // An employee hired before characters existed keeps its look selected.
  const characters = avatarCharacters.some(isCurrent)
    ? avatarCharacters
    : [{ shape: value.shape, face: value.face }, ...avatarCharacters]

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ColorSelector
        value={value.color}
        onValueChange={(color) => onChange({ ...value, color })}
        aria-label="Colour"
        className="w-full"
      >
        <ColorSelectorList className="flex flex-wrap justify-center gap-1.5">
          {avatarColors.map((option) => (
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

      <fieldset aria-label="Character" className="flex w-full flex-wrap justify-center gap-1">
        {characters.map((character) => (
          <label
            key={`${character.shape}-${character.face}`}
            className={`flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ring ${
              isCurrent(character) ? "ring-2 ring-foreground" : "hover:bg-muted"
            }`}
          >
            <input
              type="radio"
              name="avatar-character"
              aria-label={`${character.shape}, ${character.face}`}
              checked={isCurrent(character)}
              onChange={() => onChange({ ...value, ...character })}
              className="sr-only"
            />
            <Mascot size={26} shape={character.shape} face={character.face} color={value.color} />
          </label>
        ))}
      </fieldset>
    </div>
  )
}
