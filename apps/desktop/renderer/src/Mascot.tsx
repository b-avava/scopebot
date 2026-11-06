import type { AgentFace, AgentShape } from "@scope-bot/domain"
import { BotAvatar } from "@scope-bot/ui/components/avatar/BotAvatar.tsx"

interface MascotProps {
  readonly shape?: AgentShape
  readonly face?: AgentFace
  readonly color?: string
  readonly size?: number
}

/** A still avatar, for lists and messages. */
export const Mascot = ({ size = 28, ...look }: MascotProps) => <BotAvatar {...look} size={size} />

/** Marks the area a `LiveMascot` watches the cursor in. */
export const watchArea = { "data-watch-area": true }

/** The animated avatar: follows the cursor and blinks. */
export const LiveMascot = ({ size = 104, ...look }: MascotProps) => <BotAvatar {...look} size={size} live />
