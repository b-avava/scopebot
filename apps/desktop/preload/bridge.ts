import type {
  Agent,
  AgentAction,
  AgentSettings,
  BusinessProfile,
  ChatImage,
  ChatMessage,
  ChatState,
  Conversation,
  ConversationSummary,
  CreateAgent,
  LastMessage,
  ProviderCatalog,
  ProviderId,
  ProviderKey,
  ProviderPreferences,
  SearchHit,
  SentMessage,
  SideAnswer
} from "@scope-bot/domain"

export const Channels = {
  serverStatus: "server:status",
  theme: "theme:set",
  getBusiness: "business:get",
  saveBusiness: "business:save",
  listAgents: "agents:list",
  listLastMessages: "agents:last-messages",
  createAgent: "agents:create",
  updateAgent: "agents:update",
  removeAgent: "agents:remove",
  pinAgent: "agents:pin",
  search: "search:run",
  listConversations: "chat:conversations",
  createConversation: "chat:create-conversation",
  renameConversation: "chat:rename-conversation",
  removeConversation: "chat:remove-conversation",
  listMessages: "chat:messages",
  sendMessage: "chat:send",
  askAgent: "chat:ask",
  listActions: "chat:actions",
  getChatState: "chat:state",
  resumeAgent: "chat:resume",
  listModels: "models:list",
  getPreferences: "providers:preferences",
  savePreferences: "providers:save-preferences",
  saveProviderKey: "providers:save-key",
  removeProviderKey: "providers:remove-key",
  loginProvider: "providers:login"
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
  | "provider-login-failed"

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
  listLastMessages(): Promise<BridgeResult<ReadonlyArray<LastMessage>>>
  createAgent(input: CreateAgent): Promise<BridgeResult<Agent>>
  updateAgent(id: string, settings: AgentSettings): Promise<BridgeResult<Agent>>
  removeAgent(id: string): Promise<BridgeResult<void>>
  pinAgent(id: string, pinned: boolean): Promise<BridgeResult<Agent>>
  search(query: string): Promise<BridgeResult<ReadonlyArray<SearchHit>>>
  listConversations(id: string): Promise<BridgeResult<ReadonlyArray<ConversationSummary>>>
  createConversation(id: string): Promise<BridgeResult<Conversation>>
  renameConversation(id: string, conversationId: string, title: string): Promise<BridgeResult<Conversation>>
  removeConversation(id: string, conversationId: string): Promise<BridgeResult<void>>
  listMessages(id: string, conversationId: string): Promise<BridgeResult<ReadonlyArray<ChatMessage>>>
  sendMessage(
    id: string,
    conversationId: string,
    text: string,
    images: ReadonlyArray<ChatImage>
  ): Promise<BridgeResult<SentMessage>>
  askAgent(id: string, conversationId: string, text: string): Promise<BridgeResult<SideAnswer>>
  listActions(id: string): Promise<BridgeResult<ReadonlyArray<AgentAction>>>
  getChatState(id: string, conversationId: string): Promise<BridgeResult<ChatState>>
  resumeAgent(id: string, conversationId: string): Promise<BridgeResult<ChatState>>
  listModels(): Promise<BridgeResult<ReadonlyArray<ProviderCatalog>>>
  getPreferences(): Promise<BridgeResult<ProviderPreferences>>
  savePreferences(preferences: ProviderPreferences): Promise<BridgeResult<ProviderPreferences>>
  saveProviderKey(id: ProviderId, input: ProviderKey): Promise<BridgeResult<void>>
  removeProviderKey(id: ProviderId): Promise<BridgeResult<void>>
  loginProvider(id: ProviderId): Promise<BridgeResult<void>>
}
