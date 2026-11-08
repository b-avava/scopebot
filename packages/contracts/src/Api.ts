import {
  Account,
  Activity,
  ActivityId,
  ActivityNotFound,
  ActivityPatch,
  Agent,
  AgentAction,
  AgentId,
  AgentNotFound,
  AgentPaused,
  AgentSettings,
  AgentStatus,
  ApprovalDecision,
  ApprovalId,
  ApprovalNotPending,
  ApprovalRequest,
  AuthSession,
  BusinessProfile,
  ChangePassword,
  ChannelSettings,
  ChatMessage,
  ChatState,
  ConnectTelegram,
  Contact,
  ContactDetails,
  ContactId,
  ContactNotFound,
  Conversation,
  ConversationId,
  ConversationNotFound,
  ConversationRequired,
  ConversationSummary,
  CreateAgent,
  Deal,
  DealDetails,
  DealId,
  DealNotFound,
  DealStageNotFound,
  Department,
  DepartmentDetails,
  DepartmentId,
  DepartmentNotFound,
  DraftNotFound,
  EmailTaken,
  Forbidden,
  HealthStatus,
  InstagramChat,
  InstagramLogin,
  InstagramNeedsAgent,
  InstagramNotConfigured,
  InstagramNotConnected,
  InstagramSendFailed,
  InstagramStatus,
  InstagramWindowClosed,
  Invite,
  InviteInvalid,
  JoinTeam,
  LastMessage,
  LinkWhatsApp,
  Login,
  MessageId,
  ModelFailed,
  ModelNotConfigured,
  ModelRefused,
  NewActivity,
  NewApproval,
  NewInvite,
  PinAgent,
  Pipeline,
  PipelineDetails,
  PipelineId,
  PipelineInvalid,
  ProviderCatalog,
  ProviderId,
  ProviderKey,
  ProviderLoginFailed,
  ProviderPreferences,
  ReferenceNotFound,
  Register,
  RenameConversation,
  SearchHit,
  SendDraft,
  SendMessage,
  SendWhatsApp,
  SentMessage,
  Service,
  ServiceDetails,
  ServiceId,
  ServiceNotFound,
  ServicePreview,
  SideAnswer,
  SideQuestion,
  StageInUse,
  TelegramChat,
  TelegramNeedsAgent,
  TelegramNotConnected,
  TelegramSendFailed,
  TelegramStatus,
  TelegramTokenInvalid,
  TooManyAttempts,
  Unauthorized,
  User,
  UserId,
  UserNotFound,
  WhatsAppChat,
  WhatsAppNeedsAgent,
  WhatsAppNotLinked,
  WhatsAppSendFailed,
  WhatsAppSettings,
  WhatsAppStatus,
  WrongCredentials
} from "@scope-bot/domain"
import { Context, Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity, OpenApi } from "effect/http-api"

/** Who made the request. The middleware provides it to every protected endpoint. */
export class CurrentSession extends Context.Service<
  CurrentSession,
  { readonly account: Account; readonly token: string }
>()("@scope-bot/contracts/CurrentSession") {}

/** Everything except signing in needs a session. */
export class Authorization extends HttpApiMiddleware.Service<Authorization, { provides: CurrentSession }>()(
  "@scope-bot/contracts/Authorization",
  {
    error: Unauthorized,
    security: { bearer: HttpApiSecurity.bearer }
  }
) {}

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", {
    success: HealthStatus
  })
) {}

export class AuthApi extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("register", "/register", {
      payload: Register,
      success: AuthSession,
      error: EmailTaken
    }),
    HttpApiEndpoint.post("login", "/login", {
      payload: Login,
      success: AuthSession,
      error: [WrongCredentials, TooManyAttempts]
    }),
    HttpApiEndpoint.post("join", "/join", {
      payload: JoinTeam,
      success: AuthSession,
      error: [EmailTaken, InviteInvalid]
    })
  )
  .prefix("/auth") {}

export class AccountApi extends HttpApiGroup.make("account")
  .add(
    HttpApiEndpoint.get("me", "/", {
      success: Account
    }),
    HttpApiEndpoint.post("logout", "/logout"),
    HttpApiEndpoint.put("changePassword", "/password", {
      payload: ChangePassword,
      error: WrongCredentials
    })
  )
  .prefix("/account")
  .middleware(Authorization) {}

export class TeamApi extends HttpApiGroup.make("team")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(User)
    }),
    HttpApiEndpoint.post("invite", "/invites", {
      payload: NewInvite,
      success: Invite,
      error: Forbidden
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: UserId },
      error: [Forbidden, UserNotFound]
    })
  )
  .prefix("/team")
  .middleware(Authorization) {}

export class BusinessApi extends HttpApiGroup.make("business")
  .add(
    HttpApiEndpoint.get("get", "/", {
      success: BusinessProfile
    }),
    HttpApiEndpoint.put("save", "/", {
      payload: BusinessProfile,
      success: BusinessProfile,
      error: Forbidden
    })
  )
  .prefix("/business")
  .middleware(Authorization) {}

export class AgentsApi extends HttpApiGroup.make("agents")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Agent)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateAgent,
      success: Agent
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: AgentId },
      payload: AgentSettings,
      success: Agent,
      error: [AgentNotFound, DepartmentNotFound]
    }),
    HttpApiEndpoint.get("statuses", "/statuses", {
      success: Schema.Array(AgentStatus)
    }),
    HttpApiEndpoint.get("lastMessages", "/last-messages", {
      success: Schema.Array(LastMessage)
    }),
    HttpApiEndpoint.put("pin", "/:id/pinned", {
      params: { id: AgentId },
      payload: PinAgent,
      success: Agent,
      error: AgentNotFound
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: AgentId },
      error: AgentNotFound
    })
  )
  .prefix("/agents")
  .middleware(Authorization) {}

export class ContactsApi extends HttpApiGroup.make("contacts")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Contact)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: ContactDetails,
      success: Contact,
      error: ReferenceNotFound
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: ContactId },
      payload: ContactDetails,
      success: Contact,
      error: [ContactNotFound, ReferenceNotFound]
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: ContactId },
      error: ContactNotFound
    })
  )
  .prefix("/contacts")
  .middleware(Authorization) {}

export class DepartmentsApi extends HttpApiGroup.make("departments")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Department)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: DepartmentDetails,
      success: Department
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: DepartmentId },
      payload: DepartmentDetails,
      success: Department,
      error: DepartmentNotFound
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: DepartmentId },
      error: DepartmentNotFound
    })
  )
  .prefix("/departments")
  .middleware(Authorization) {}

export class PipelinesApi extends HttpApiGroup.make("pipelines")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Pipeline)
    }),
    HttpApiEndpoint.put("update", "/:id", {
      params: { id: PipelineId },
      payload: PipelineDetails,
      success: Pipeline,
      error: [DealStageNotFound, PipelineInvalid, StageInUse]
    })
  )
  .prefix("/pipelines")
  .middleware(Authorization) {}

export class ServicesApi extends HttpApiGroup.make("services")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Service)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: ServiceDetails,
      success: Service,
      error: ReferenceNotFound
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: ServiceId },
      payload: ServiceDetails,
      success: Service,
      error: [ServiceNotFound, ReferenceNotFound]
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: ServiceId },
      error: ServiceNotFound
    })
  )
  .prefix("/services")
  .middleware(Authorization) {}

export class ActivitiesApi extends HttpApiGroup.make("activities")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Activity)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: NewActivity,
      success: Activity,
      error: ReferenceNotFound
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: ActivityId },
      payload: ActivityPatch,
      success: Activity,
      error: ActivityNotFound
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: ActivityId },
      error: ActivityNotFound
    })
  )
  .prefix("/activities")
  .middleware(Authorization) {}

export class ApprovalsApi extends HttpApiGroup.make("approvals")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(ApprovalRequest)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: NewApproval,
      success: ApprovalRequest,
      error: ReferenceNotFound
    }),
    HttpApiEndpoint.put("decide", "/:id/decision", {
      params: { id: ApprovalId },
      payload: ApprovalDecision,
      success: ApprovalRequest,
      error: ApprovalNotPending
    })
  )
  .prefix("/approvals")
  .middleware(Authorization) {}

/** Calls that need an employee to think. They run a model, so they can take a while. */
export class AssistantApi extends HttpApiGroup.make("assistant")
  .add(
    HttpApiEndpoint.post("previewService", "/preview", {
      payload: ServicePreview,
      success: SideAnswer,
      error: [AgentNotFound, ModelNotConfigured, ModelFailed, ModelRefused]
    }),
    HttpApiEndpoint.post("summarizeContact", "/contacts/:id/summary", {
      params: { id: ContactId },
      success: Contact,
      error: [ContactNotFound, AgentNotFound, ModelNotConfigured, ModelFailed, ModelRefused]
    })
  )
  .prefix("/assistant")
  .middleware(Authorization) {}

export class DealsApi extends HttpApiGroup.make("deals")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Deal)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: DealDetails,
      success: Deal,
      error: [DealStageNotFound, ContactNotFound, ReferenceNotFound]
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: DealId },
      payload: DealDetails,
      success: Deal,
      error: [DealNotFound, DealStageNotFound, ContactNotFound, ReferenceNotFound]
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: DealId },
      error: DealNotFound
    })
  )
  .prefix("/deals")
  .middleware(Authorization) {}

const chatParams = { id: AgentId, conversationId: ConversationId }

export class ChatApi extends HttpApiGroup.make("chat")
  .add(
    HttpApiEndpoint.get("conversations", "/:id/conversations", {
      params: { id: AgentId },
      success: Schema.Array(ConversationSummary),
      error: AgentNotFound
    }),
    HttpApiEndpoint.post("createConversation", "/:id/conversations", {
      params: { id: AgentId },
      success: Conversation,
      error: AgentNotFound
    }),
    HttpApiEndpoint.patch("renameConversation", "/:id/conversations/:conversationId", {
      params: chatParams,
      payload: RenameConversation,
      success: Conversation,
      error: [AgentNotFound, ConversationNotFound]
    }),
    HttpApiEndpoint.delete("removeConversation", "/:id/conversations/:conversationId", {
      params: chatParams,
      error: [AgentNotFound, ConversationNotFound, ConversationRequired]
    }),
    HttpApiEndpoint.get("messages", "/:id/conversations/:conversationId/messages", {
      params: chatParams,
      success: Schema.Array(ChatMessage),
      error: [AgentNotFound, ConversationNotFound]
    }),
    HttpApiEndpoint.post("send", "/:id/conversations/:conversationId/messages", {
      params: chatParams,
      payload: SendMessage,
      success: SentMessage,
      error: [AgentNotFound, ConversationNotFound, AgentPaused, ModelNotConfigured, ModelFailed, ModelRefused]
    }),
    HttpApiEndpoint.post("ask", "/:id/conversations/:conversationId/ask", {
      params: chatParams,
      payload: SideQuestion,
      success: SideAnswer,
      error: [AgentNotFound, ConversationNotFound, ModelNotConfigured, ModelFailed, ModelRefused]
    }),
    HttpApiEndpoint.get("actions", "/:id/actions", {
      params: { id: AgentId },
      success: Schema.Array(AgentAction),
      error: AgentNotFound
    }),
    HttpApiEndpoint.get("state", "/:id/conversations/:conversationId/state", {
      params: chatParams,
      success: ChatState,
      error: [AgentNotFound, ConversationNotFound]
    }),
    HttpApiEndpoint.post("resume", "/:id/conversations/:conversationId/resume", {
      params: chatParams,
      success: ChatState,
      error: [AgentNotFound, ConversationNotFound]
    })
  )
  .prefix("/agents")
  .middleware(Authorization) {}

export class SearchApi extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.get("run", "/", {
      query: { q: Schema.String },
      success: Schema.Array(SearchHit)
    })
  )
  .prefix("/search")
  .middleware(Authorization) {}

export class ModelsApi extends HttpApiGroup.make("models")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(ProviderCatalog)
    })
  )
  .prefix("/models")
  .middleware(Authorization) {}

export class ProvidersApi extends HttpApiGroup.make("providers")
  .add(
    HttpApiEndpoint.get("preferences", "/preferences", {
      success: ProviderPreferences
    }),
    HttpApiEndpoint.put("savePreferences", "/preferences", {
      payload: ProviderPreferences,
      success: ProviderPreferences
    }),
    HttpApiEndpoint.put("saveKey", "/:id/key", {
      params: { id: ProviderId },
      payload: ProviderKey,
      error: Forbidden
    }),
    HttpApiEndpoint.delete("removeKey", "/:id/key", {
      params: { id: ProviderId },
      error: Forbidden
    }),
    HttpApiEndpoint.post("login", "/:id/login", {
      params: { id: ProviderId },
      error: ProviderLoginFailed
    })
  )
  .prefix("/providers")
  .middleware(Authorization) {}

/** The WhatsApp number of the business. Linking and settings are for owners and admins. */
export class WhatsAppApi extends HttpApiGroup.make("whatsapp")
  .add(
    HttpApiEndpoint.get("status", "/", {
      success: WhatsAppStatus
    }),
    HttpApiEndpoint.put("saveSettings", "/settings", {
      payload: WhatsAppSettings,
      success: WhatsAppStatus,
      error: [AgentNotFound, Forbidden]
    }),
    HttpApiEndpoint.post("link", "/link", {
      payload: LinkWhatsApp,
      success: WhatsAppStatus,
      error: [WhatsAppNeedsAgent, WhatsAppSendFailed, Forbidden]
    }),
    HttpApiEndpoint.post("cancelLink", "/link/cancel", {
      success: WhatsAppStatus,
      error: Forbidden
    }),
    HttpApiEndpoint.delete("unlink", "/link", {
      success: WhatsAppStatus,
      error: Forbidden
    }),
    HttpApiEndpoint.get("chats", "/chats", {
      success: Schema.Array(WhatsAppChat)
    }),
    HttpApiEndpoint.get("messages", "/chats/:id/messages", {
      params: { id: ConversationId },
      success: Schema.Array(ChatMessage),
      error: ConversationNotFound
    }),
    HttpApiEndpoint.post("send", "/chats/:id/messages", {
      params: { id: ConversationId },
      payload: SendWhatsApp,
      success: ChatMessage,
      error: [ConversationNotFound, WhatsAppNotLinked, WhatsAppSendFailed]
    }),
    HttpApiEndpoint.post("sendDraft", "/drafts/:id/send", {
      params: { id: MessageId },
      payload: SendDraft,
      success: ChatMessage,
      error: [DraftNotFound, WhatsAppNotLinked, WhatsAppSendFailed]
    }),
    HttpApiEndpoint.post("discardDraft", "/drafts/:id/discard", {
      params: { id: MessageId },
      success: ChatMessage,
      error: DraftNotFound
    }),
    HttpApiEndpoint.post("resume", "/chats/:id/resume", {
      params: { id: ConversationId },
      error: ConversationNotFound
    })
  )
  .prefix("/whatsapp")
  .middleware(Authorization) {}

/** The Telegram bot of the business. Connecting and settings are for owners and admins. */
export class TelegramApi extends HttpApiGroup.make("telegram")
  .add(
    HttpApiEndpoint.get("status", "/", {
      success: TelegramStatus
    }),
    HttpApiEndpoint.put("saveSettings", "/settings", {
      payload: ChannelSettings,
      success: TelegramStatus,
      error: [AgentNotFound, Forbidden]
    }),
    HttpApiEndpoint.post("connect", "/bot", {
      payload: ConnectTelegram,
      success: TelegramStatus,
      error: [TelegramTokenInvalid, TelegramNeedsAgent, TelegramSendFailed, Forbidden]
    }),
    HttpApiEndpoint.delete("disconnect", "/bot", {
      success: TelegramStatus,
      error: Forbidden
    }),
    HttpApiEndpoint.get("chats", "/chats", {
      success: Schema.Array(TelegramChat)
    }),
    HttpApiEndpoint.get("messages", "/chats/:id/messages", {
      params: { id: ConversationId },
      success: Schema.Array(ChatMessage),
      error: ConversationNotFound
    }),
    HttpApiEndpoint.post("send", "/chats/:id/messages", {
      params: { id: ConversationId },
      payload: SendWhatsApp,
      success: ChatMessage,
      error: [ConversationNotFound, TelegramNotConnected, TelegramSendFailed]
    }),
    HttpApiEndpoint.post("sendDraft", "/drafts/:id/send", {
      params: { id: MessageId },
      payload: SendDraft,
      success: ChatMessage,
      error: [DraftNotFound, TelegramNotConnected, TelegramSendFailed]
    }),
    HttpApiEndpoint.post("discardDraft", "/drafts/:id/discard", {
      params: { id: MessageId },
      success: ChatMessage,
      error: DraftNotFound
    }),
    HttpApiEndpoint.post("resume", "/chats/:id/resume", {
      params: { id: ConversationId },
      error: ConversationNotFound
    })
  )
  .prefix("/telegram")
  .middleware(Authorization) {}

/** The Instagram account of the business. Connecting and settings are for owners and admins. */
export class InstagramApi extends HttpApiGroup.make("instagram")
  .add(
    HttpApiEndpoint.get("status", "/", {
      success: InstagramStatus
    }),
    HttpApiEndpoint.put("saveSettings", "/settings", {
      payload: ChannelSettings,
      success: InstagramStatus,
      error: [AgentNotFound, Forbidden]
    }),
    HttpApiEndpoint.post("login", "/login", {
      success: InstagramLogin,
      error: [InstagramNotConfigured, InstagramNeedsAgent, Forbidden]
    }),
    HttpApiEndpoint.post("checkReachable", "/check", {
      success: InstagramStatus
    }),
    HttpApiEndpoint.delete("disconnect", "/account", {
      success: InstagramStatus,
      error: Forbidden
    }),
    HttpApiEndpoint.get("chats", "/chats", {
      success: Schema.Array(InstagramChat)
    }),
    HttpApiEndpoint.get("messages", "/chats/:id/messages", {
      params: { id: ConversationId },
      success: Schema.Array(ChatMessage),
      error: ConversationNotFound
    }),
    HttpApiEndpoint.post("send", "/chats/:id/messages", {
      params: { id: ConversationId },
      payload: SendWhatsApp,
      success: ChatMessage,
      error: [ConversationNotFound, InstagramNotConnected, InstagramWindowClosed, InstagramSendFailed]
    }),
    HttpApiEndpoint.post("sendDraft", "/drafts/:id/send", {
      params: { id: MessageId },
      payload: SendDraft,
      success: ChatMessage,
      error: [DraftNotFound, InstagramNotConnected, InstagramWindowClosed, InstagramSendFailed]
    }),
    HttpApiEndpoint.post("discardDraft", "/drafts/:id/discard", {
      params: { id: MessageId },
      success: ChatMessage,
      error: DraftNotFound
    }),
    HttpApiEndpoint.post("resume", "/chats/:id/resume", {
      params: { id: ConversationId },
      error: ConversationNotFound
    })
  )
  .prefix("/instagram")
  .middleware(Authorization) {}

export class Api extends HttpApi.make("scope-bot")
  .add(SystemApi)
  .add(AuthApi)
  .add(AccountApi)
  .add(TeamApi)
  .add(BusinessApi)
  .add(AgentsApi)
  .add(ContactsApi)
  .add(DepartmentsApi)
  .add(PipelinesApi)
  .add(DealsApi)
  .add(ServicesApi)
  .add(ActivitiesApi)
  .add(ApprovalsApi)
  .add(AssistantApi)
  .add(ChatApi)
  .add(SearchApi)
  .add(ModelsApi)
  .add(ProvidersApi)
  .add(WhatsAppApi)
  .add(TelegramApi)
  .add(InstagramApi)
  .annotateMerge(OpenApi.annotations({ title: "Scope Bot API" })) {}
