import type { ModelFailed, ModelNotConfigured, ModelRefused } from "@scope-bot/domain"
import { Context, type Effect } from "effect"

export interface ChatTurn {
  readonly role: "user" | "assistant"
  readonly text: string
}

export interface ChatRequest {
  /** Empty uses the provider's default model. */
  readonly model: string
  readonly system: string
  readonly turns: ReadonlyArray<ChatTurn>
}

export interface ChatReply {
  readonly text: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
}

/** The language model behind agents. Providers plug in as layers. */
export class ChatModel extends Context.Service<
  ChatModel,
  {
    reply(request: ChatRequest): Effect.Effect<ChatReply, ModelNotConfigured | ModelFailed | ModelRefused>
  }
>()("@scope-bot/agents/ChatModel") {}
