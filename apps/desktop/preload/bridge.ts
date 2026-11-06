import type {
  Agent,
  AgentAction,
  AgentSettings,
  BusinessProfile,
  ChatMessage,
  ChatState,
  CreateAgent,
  ModelCatalog,
  SentMessage
} from "@scope-bot/domain"

export const Channels = {
  serverStatus: "server:status",
  theme: "theme:set",
  getBusiness: "business:get",
  saveBusiness: "business:save",
  listAgents: "agents:list",
  createAgent: "agents:create",
  updateAgent: "agents:update",
  removeAgent: "agents:remove",
  listMessages: "chat:messages",
  sendMessage: "chat:send",
  listActions: "chat:actions",
  getChatState: "chat:state",
  resumeAgent: "chat:resume",
  listModels: "models:list"
} as const

export interface ServerStatus {
  readonly state: "online" | "offline"
  readonly url: string
}

export type Theme = "light" | "dark"

export type BridgeError =
  | "offline"
  | "invalid"
  | "not-found"
  | "paused"
  | "model-not-configured"
  | "model-refused"
  | "model-failed"

/** IPC cannot carry typed errors, so failures travel as plain values. */
export type BridgeResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: BridgeError }

/** The only API the renderer can reach. Keep it narrow and typed. */
export interface ScopeBotBridge {
  getServerStatus(): Promise<ServerStatus>
  setTheme(theme: Theme): Promise<void>
  getBusiness(): Promise<BridgeResult<BusinessProfile>>
  saveBusiness(business: BusinessProfile): Promise<BridgeResult<BusinessProfile>>
  listAgents(): Promise<BridgeResult<ReadonlyArray<Agent>>>
  createAgent(input: CreateAgent): Promise<BridgeResult<Agent>>
  updateAgent(id: string, settings: AgentSettings): Promise<BridgeResult<Agent>>
  removeAgent(id: string): Promise<BridgeResult<void>>
  listMessages(id: string): Promise<BridgeResult<ReadonlyArray<ChatMessage>>>
  sendMessage(id: string, text: string): Promise<BridgeResult<SentMessage>>
  listActions(id: string): Promise<BridgeResult<ReadonlyArray<AgentAction>>>
  getChatState(id: string): Promise<BridgeResult<ChatState>>
  resumeAgent(id: string): Promise<BridgeResult<ChatState>>
  listModels(): Promise<BridgeResult<ModelCatalog>>
}
