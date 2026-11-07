import type {
  ChatImage,
  ModelCatalog,
  ModelFailed,
  ModelNotConfigured,
  ModelRefused,
  ReasoningEffort
} from "@scope-bot/domain"
import { Context, type Effect } from "effect"

export interface ChatTurn {
  readonly role: "user" | "assistant"
  readonly text: string
  readonly images?: ReadonlyArray<ChatImage>
  /** Written by a supervisor, not the customer. */
  readonly supervisor?: boolean
}

export interface ChatRequest {
  /** Empty uses the provider's default model. */
  readonly model: string
  readonly reasoning: ReasoningEffort
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
    /** What the provider offers right now. */
    readonly models: Effect.Effect<ModelCatalog, ModelNotConfigured | ModelFailed>
    reply(request: ChatRequest): Effect.Effect<ChatReply, ModelNotConfigured | ModelFailed | ModelRefused>
  }
>()("@scope-bot/agents/ChatModel") {}
