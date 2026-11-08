import type {
  Account,
  Activity,
  ActivityPatch,
  Agent,
  AgentAction,
  AgentSettings,
  AgentStatus,
  ApprovalDecision,
  ApprovalRequest,
  BusinessProfile,
  ChangePassword,
  ChannelSettings,
  ChatImage,
  ChatMessage,
  ChatState,
  Contact,
  ContactDetails,
  Conversation,
  ConversationSummary,
  CreateAgent,
  Deal,
  DealDetails,
  Department,
  DepartmentDetails,
  InstagramChat,
  InstagramStatus,
  Invite,
  JoinTeam,
  LastMessage,
  Login,
  NewActivity,
  NewInvite,
  Pipeline,
  PipelineDetails,
  ProviderCatalog,
  ProviderId,
  ProviderKey,
  ProviderPreferences,
  Register,
  SearchHit,
  SentMessage,
  Service,
  ServiceDetails,
  ServicePreview,
  SideAnswer,
  TelegramChat,
  TelegramStatus,
  User,
  WhatsAppChat,
  WhatsAppSettings,
  WhatsAppStatus
} from "@scope-bot/domain"

export const Channels = {
  serverStatus: "server:status",
  theme: "theme:set",
  getAccount: "account:get",
  register: "account:register",
  login: "account:login",
  joinTeam: "account:join",
  logout: "account:logout",
  changePassword: "account:password",
  listTeam: "team:list",
  createInvite: "team:invite",
  removeMember: "team:remove",
  getBusiness: "business:get",
  saveBusiness: "business:save",
  listAgents: "agents:list",
  listLastMessages: "agents:last-messages",
  listAgentStatuses: "agents:statuses",
  createAgent: "agents:create",
  updateAgent: "agents:update",
  removeAgent: "agents:remove",
  pinAgent: "agents:pin",
  listContacts: "contacts:list",
  createContact: "contacts:create",
  updateContact: "contacts:update",
  removeContact: "contacts:remove",
  listDepartments: "departments:list",
  createDepartment: "departments:create",
  updateDepartment: "departments:update",
  removeDepartment: "departments:remove",
  listPipelines: "pipelines:list",
  updatePipeline: "pipelines:update",
  listServices: "services:list",
  createService: "services:create",
  updateService: "services:update",
  removeService: "services:remove",
  listActivities: "activities:list",
  createActivity: "activities:create",
  updateActivity: "activities:update",
  removeActivity: "activities:remove",
  listApprovals: "approvals:list",
  decideApproval: "approvals:decide",
  previewService: "assistant:preview",
  summarizeContact: "assistant:summary",
  listDeals: "deals:list",
  createDeal: "deals:create",
  updateDeal: "deals:update",
  removeDeal: "deals:remove",
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
  loginProvider: "providers:login",
  getWhatsApp: "whatsapp:status",
  saveWhatsAppSettings: "whatsapp:settings",
  linkWhatsApp: "whatsapp:link",
  cancelWhatsAppLink: "whatsapp:cancel-link",
  unlinkWhatsApp: "whatsapp:unlink",
  listWhatsAppChats: "whatsapp:chats",
  listWhatsAppMessages: "whatsapp:messages",
  sendWhatsApp: "whatsapp:send",
  sendWhatsAppDraft: "whatsapp:send-draft",
  discardWhatsAppDraft: "whatsapp:discard-draft",
  resumeWhatsAppChat: "whatsapp:resume",
  getTelegram: "telegram:status",
  saveTelegramSettings: "telegram:settings",
  connectTelegram: "telegram:connect",
  disconnectTelegram: "telegram:disconnect",
  listTelegramChats: "telegram:chats",
  listTelegramMessages: "telegram:messages",
  sendTelegram: "telegram:send",
  sendTelegramDraft: "telegram:send-draft",
  discardTelegramDraft: "telegram:discard-draft",
  resumeTelegramChat: "telegram:resume",
  getInstagram: "instagram:status",
  saveInstagramSettings: "instagram:settings",
  startInstagramLogin: "instagram:login",
  checkInstagram: "instagram:check",
  disconnectInstagram: "instagram:disconnect",
  listInstagramChats: "instagram:chats",
  listInstagramMessages: "instagram:messages",
  sendInstagram: "instagram:send",
  sendInstagramDraft: "instagram:send-draft",
  discardInstagramDraft: "instagram:discard-draft",
  resumeInstagramChat: "instagram:resume"
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
  | "contact-not-found"
  | "department-not-found"
  | "deal-not-found"
  | "gone"
  | "stage-in-use"
  | "pipeline-invalid"
  | "paused"
  | "model-not-configured"
  | "model-refused"
  | "model-failed"
  | "provider-login-failed"
  | "signed-out"
  | "wrong-credentials"
  | "too-many-attempts"
  | "email-taken"
  | "forbidden"
  | "invite-invalid"
  | "whatsapp-not-linked"
  | "whatsapp-needs-agent"
  | "whatsapp-send-failed"
  | "telegram-token-invalid"
  | "telegram-not-connected"
  | "telegram-needs-agent"
  | "telegram-send-failed"
  | "instagram-not-configured"
  | "instagram-not-connected"
  | "instagram-needs-agent"
  | "instagram-window-closed"
  | "instagram-send-failed"

/** IPC cannot carry typed errors, so failures travel as plain values. */
export type BridgeResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: BridgeError }

/** The only API the renderer can reach. Keep it narrow and typed. */
export interface ScopeBotBridge {
  getServerStatus(): Promise<ServerStatus>
  setTheme(theme: Theme): Promise<void>
  /** Empty when nobody is signed in. The token itself never reaches this side. */
  getAccount(): Promise<BridgeResult<Account | null>>
  register(input: Register): Promise<BridgeResult<Account>>
  login(input: Login): Promise<BridgeResult<Account>>
  joinTeam(input: JoinTeam): Promise<BridgeResult<Account>>
  logout(): Promise<BridgeResult<void>>
  changePassword(input: ChangePassword): Promise<BridgeResult<void>>
  listTeam(): Promise<BridgeResult<ReadonlyArray<User>>>
  createInvite(input: NewInvite): Promise<BridgeResult<Invite>>
  removeMember(id: string): Promise<BridgeResult<void>>
  getBusiness(): Promise<BridgeResult<BusinessProfile>>
  saveBusiness(business: BusinessProfile): Promise<BridgeResult<BusinessProfile>>
  listAgents(): Promise<BridgeResult<ReadonlyArray<Agent>>>
  listLastMessages(): Promise<BridgeResult<ReadonlyArray<LastMessage>>>
  listAgentStatuses(): Promise<BridgeResult<ReadonlyArray<AgentStatus>>>
  createAgent(input: CreateAgent): Promise<BridgeResult<Agent>>
  updateAgent(id: string, settings: AgentSettings): Promise<BridgeResult<Agent>>
  removeAgent(id: string): Promise<BridgeResult<void>>
  pinAgent(id: string, pinned: boolean): Promise<BridgeResult<Agent>>
  listContacts(): Promise<BridgeResult<ReadonlyArray<Contact>>>
  createContact(details: ContactDetails): Promise<BridgeResult<Contact>>
  updateContact(id: string, details: ContactDetails): Promise<BridgeResult<Contact>>
  removeContact(id: string): Promise<BridgeResult<void>>
  listDepartments(): Promise<BridgeResult<ReadonlyArray<Department>>>
  createDepartment(details: DepartmentDetails): Promise<BridgeResult<Department>>
  updateDepartment(id: string, details: DepartmentDetails): Promise<BridgeResult<Department>>
  removeDepartment(id: string): Promise<BridgeResult<void>>
  listPipelines(): Promise<BridgeResult<ReadonlyArray<Pipeline>>>
  updatePipeline(id: string, details: PipelineDetails): Promise<BridgeResult<Pipeline>>
  listServices(): Promise<BridgeResult<ReadonlyArray<Service>>>
  createService(details: ServiceDetails): Promise<BridgeResult<Service>>
  updateService(id: string, details: ServiceDetails): Promise<BridgeResult<Service>>
  removeService(id: string): Promise<BridgeResult<void>>
  listActivities(): Promise<BridgeResult<ReadonlyArray<Activity>>>
  createActivity(input: NewActivity): Promise<BridgeResult<Activity>>
  updateActivity(id: string, patch: ActivityPatch): Promise<BridgeResult<Activity>>
  removeActivity(id: string): Promise<BridgeResult<void>>
  listApprovals(): Promise<BridgeResult<ReadonlyArray<ApprovalRequest>>>
  decideApproval(id: string, decision: ApprovalDecision): Promise<BridgeResult<ApprovalRequest>>
  previewService(input: ServicePreview): Promise<BridgeResult<SideAnswer>>
  summarizeContact(id: string): Promise<BridgeResult<Contact>>
  listDeals(): Promise<BridgeResult<ReadonlyArray<Deal>>>
  createDeal(details: DealDetails): Promise<BridgeResult<Deal>>
  updateDeal(id: string, details: DealDetails): Promise<BridgeResult<Deal>>
  removeDeal(id: string): Promise<BridgeResult<void>>
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
  getWhatsApp(): Promise<BridgeResult<WhatsAppStatus>>
  saveWhatsAppSettings(settings: WhatsAppSettings): Promise<BridgeResult<WhatsAppStatus>>
  /** With a phone number, the phone types a code instead of scanning a QR code. */
  linkWhatsApp(phone: string | null): Promise<BridgeResult<WhatsAppStatus>>
  cancelWhatsAppLink(): Promise<BridgeResult<WhatsAppStatus>>
  unlinkWhatsApp(): Promise<BridgeResult<WhatsAppStatus>>
  listWhatsAppChats(): Promise<BridgeResult<ReadonlyArray<WhatsAppChat>>>
  listWhatsAppMessages(chatId: string): Promise<BridgeResult<ReadonlyArray<ChatMessage>>>
  sendWhatsApp(chatId: string, text: string): Promise<BridgeResult<ChatMessage>>
  /** Null sends the draft as the employee wrote it. */
  sendWhatsAppDraft(id: string, text: string | null): Promise<BridgeResult<ChatMessage>>
  discardWhatsAppDraft(id: string): Promise<BridgeResult<ChatMessage>>
  /** Gives a chat a person took over back to the employee. */
  resumeWhatsAppChat(chatId: string): Promise<BridgeResult<void>>
  getTelegram(): Promise<BridgeResult<TelegramStatus>>
  saveTelegramSettings(settings: ChannelSettings): Promise<BridgeResult<TelegramStatus>>
  connectTelegram(token: string): Promise<BridgeResult<TelegramStatus>>
  disconnectTelegram(): Promise<BridgeResult<TelegramStatus>>
  listTelegramChats(): Promise<BridgeResult<ReadonlyArray<TelegramChat>>>
  listTelegramMessages(chatId: string): Promise<BridgeResult<ReadonlyArray<ChatMessage>>>
  sendTelegram(chatId: string, text: string): Promise<BridgeResult<ChatMessage>>
  /** Null sends the draft as the employee wrote it. */
  sendTelegramDraft(id: string, text: string | null): Promise<BridgeResult<ChatMessage>>
  discardTelegramDraft(id: string): Promise<BridgeResult<ChatMessage>>
  resumeTelegramChat(chatId: string): Promise<BridgeResult<void>>
  getInstagram(): Promise<BridgeResult<InstagramStatus>>
  saveInstagramSettings(settings: ChannelSettings): Promise<BridgeResult<InstagramStatus>>
  /** Opens Instagram's sign in in the browser. The server finishes the connection. */
  startInstagramLogin(): Promise<BridgeResult<void>>
  checkInstagram(): Promise<BridgeResult<InstagramStatus>>
  disconnectInstagram(): Promise<BridgeResult<InstagramStatus>>
  listInstagramChats(): Promise<BridgeResult<ReadonlyArray<InstagramChat>>>
  listInstagramMessages(chatId: string): Promise<BridgeResult<ReadonlyArray<ChatMessage>>>
  sendInstagram(chatId: string, text: string): Promise<BridgeResult<ChatMessage>>
  sendInstagramDraft(id: string, text: string | null): Promise<BridgeResult<ChatMessage>>
  discardInstagramDraft(id: string): Promise<BridgeResult<ChatMessage>>
  resumeInstagramChat(chatId: string): Promise<BridgeResult<void>>
}
