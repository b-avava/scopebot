import { Schema } from "effect"
import { AgentId } from "./Agent.ts"

/** Where customers write from, other than the app itself. */
export const Channel = Schema.Literals(["whatsapp", "telegram", "instagram"])
export type Channel = typeof Channel.Type

/** Who gets answers on a channel: anyone who writes, or only people already in the CRM. */
export const ChannelAudience = Schema.Literals(["everyone", "contacts"])
export type ChannelAudience = typeof ChannelAudience.Type

/** The same on every channel: who answers, whom, and whether a person checks each reply. */
export const ChannelSettings = Schema.Struct({
  /** The employee every chat on the channel goes to. */
  agentId: Schema.NullOr(AgentId),
  audience: ChannelAudience,
  /** Off means every reply is a draft that a person sends. */
  answersAlone: Schema.Boolean
})
export type ChannelSettings = typeof ChannelSettings.Type

export const defaultChannelSettings: ChannelSettings = { agentId: null, audience: "everyone", answersAlone: false }
