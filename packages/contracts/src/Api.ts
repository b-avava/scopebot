import {
  Account,
  ActionNotFound,
  Activity,
  ActivityId,
  ActivityNotFound,
  ActivityPage,
  ActivityPatch,
  ActivityQuery,
  Agent,
  AgentAction,
  AgentId,
  AgentNotFound,
  AgentPaused,
  AgentRule,
  AgentSettings,
  AgentStatus,
  Appointment,
  AppointmentClosed,
  AppointmentId,
  AppointmentNotFound,
  AppointmentOutcome,
  ApprovalDecision,
  ApprovalId,
  ApprovalNotPending,
  ApprovalRequest,
  AuthOptions,
  AuthSession,
  BusinessProfile,
  CalendarOff,
  CalendarSettings,
  CancelAppointment,
  CannotAnswerAgain,
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
  DecideSuggestion,
  Department,
  DepartmentDetails,
  DepartmentId,
  DepartmentNotFound,
  DraftedRule,
  DraftNotFound,
  DraftRule,
  EditQuestion,
  EmailTaken,
  Forbidden,
  GiveFeedback,
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
  LiveAnswer,
  Login,
  MessageFeedback,
  MessageId,
  ModelFailed,
  ModelNotConfigured,
  ModelRefused,
  MoveAppointment,
  NewActivity,
  NewAppointment,
  NewApproval,
  NewInvite,
  NewRule,
  NothingHeard,
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
  ReminderLog,
  RenameConversation,
  RuleDecision,
  RuleId,
  RuleNotFound,
  RulePatch,
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
  SetupCodeInvalid,
  SideAnswer,
  SideQuestion,
  SignupClosed,
  Slot,
  SlotQuery,
  Specialist,
  SpecialistDetails,
  SpecialistId,
  SpecialistNotFound,
  StageInUse,
  SuggestionNotFound,
  TelegramChat,
  TelegramNeedsAgent,
  TelegramNotConnected,
  TelegramSendFailed,
  TelegramStatus,
  TelegramTokenInvalid,
  TimeTaken,
  TimeUnavailable,
  TooManyAttempts,
  TooManyRules,
  Transcribe,
  Transcript,
  Unauthorized,
  User,
  UserId,
  UserNotFound,
  VoiceFailed,
  VoiceNotConfigured,
  VoiceStatus,
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

/** The session of a browser, which its page cannot read (ADR 0029). */
export const SESSION_COOKIE = "scope_bot_session"

export const sessionCookie = HttpApiSecurity.apiKey({ key: SESSION_COOKIE, in: "cookie" })

/** Everything except signing in needs a session: a bearer token from the desktop app, or the cookie of a browser. */
export class Authorization extends HttpApiMiddleware.Service<Authorization, { provides: CurrentSession }>()(
  "@scope-bot/contracts/Authorization",
  {
    error: Unauthorized,
    security: { bearer: HttpApiSecurity.bearer, cookie: sessionCookie }
  }
) {}

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", {
    success: HealthStatus
  })
) {}

export class AuthApi extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("options", "/options", {
      success: AuthOptions
    }),
    HttpApiEndpoint.post("register", "/register", {
      payload: Register,
      success: AuthSession,
      error: [EmailTaken, SignupClosed, SetupCodeInvalid]
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

/** Signing in from a browser: the session goes into a cookie, never into the answer (ADR 0029). */
export class WebAuthApi extends HttpApiGroup.make("webAuth")
  .add(
    HttpApiEndpoint.post("register", "/register", {
      payload: Register,
      success: Account,
      error: [EmailTaken, SignupClosed, SetupCodeInvalid]
    }),
    HttpApiEndpoint.post("login", "/login", {
      payload: Login,
      success: Account,
      error: [WrongCredentials, TooManyAttempts]
    }),
    HttpApiEndpoint.post("join", "/join", {
      payload: JoinTeam,
      success: Account,
      error: [EmailTaken, InviteInvalid]
    })
  )
  .prefix("/auth/web") {}

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

/** A drafted reply that books, moves or cancels is not sent when that cannot be done. */
/** Answering the last question again fails as sending does, or when it is not the last one. */
const answerAgainErrors = [
  AgentNotFound,
  ConversationNotFound,
  AgentPaused,
  CannotAnswerAgain,
  ModelNotConfigured,
  ModelFailed,
  ModelRefused
] as const

const appointmentStepErrors = [TimeTaken, TimeUnavailable, AppointmentClosed, CalendarOff] as const

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
    }),
    HttpApiEndpoint.get("conversationActions", "/:id/conversations/:conversationId/actions", {
      params: chatParams,
      success: Schema.Array(AgentAction),
      error: [AgentNotFound, ConversationNotFound]
    }),
    HttpApiEndpoint.post("regenerate", "/:id/conversations/:conversationId/regenerate", {
      params: chatParams,
      success: SentMessage,
      error: answerAgainErrors
    }),
    HttpApiEndpoint.post("edit", "/:id/conversations/:conversationId/edit", {
      params: chatParams,
      payload: EditQuestion,
      success: SentMessage,
      error: answerAgainErrors
    }),
    HttpApiEndpoint.get("live", "/:id/conversations/:conversationId/live", {
      params: chatParams,
      // Answers at once when the chat changed since that version, otherwise after a short wait (ADR 0025).
      query: { after: Schema.FiniteFromString },
      success: LiveAnswer,
      error: [AgentNotFound, ConversationNotFound]
    }),
    HttpApiEndpoint.post("stop", "/:id/conversations/:conversationId/stop", {
      params: chatParams,
      error: [AgentNotFound, ConversationNotFound]
    }),
    HttpApiEndpoint.post("decide", "/:id/conversations/:conversationId/messages/:messageId/decide", {
      params: { ...chatParams, messageId: MessageId },
      payload: DecideSuggestion,
      success: ChatMessage,
      error: [SuggestionNotFound, ...appointmentStepErrors]
    })
  )
  .prefix("/agents")
  .middleware(Authorization) {}

const ruleParams = { id: AgentId, ruleId: RuleId }

/** Feedback on answers and the employee's rules from the team (ADR 0023). */
export class CoachingApi extends HttpApiGroup.make("coaching")
  .add(
    HttpApiEndpoint.put("giveFeedback", "/:id/conversations/:conversationId/messages/:messageId/feedback", {
      params: { ...chatParams, messageId: MessageId },
      payload: GiveFeedback,
      success: MessageFeedback,
      error: [AgentNotFound, ConversationNotFound, Forbidden]
    }),
    HttpApiEndpoint.get("feedback", "/:id/conversations/:conversationId/feedback", {
      params: chatParams,
      success: Schema.Array(MessageFeedback),
      error: [AgentNotFound, ConversationNotFound]
    }),
    HttpApiEndpoint.get("rules", "/:id/rules", {
      params: { id: AgentId },
      success: Schema.Array(AgentRule),
      error: AgentNotFound
    }),
    HttpApiEndpoint.post("addRule", "/:id/rules", {
      params: { id: AgentId },
      payload: NewRule,
      success: AgentRule,
      error: [AgentNotFound, TooManyRules, Forbidden]
    }),
    HttpApiEndpoint.post("draftRule", "/:id/rules/draft", {
      params: { id: AgentId },
      payload: DraftRule,
      success: DraftedRule,
      error: [AgentNotFound, ModelNotConfigured, ModelFailed, ModelRefused]
    }),
    HttpApiEndpoint.patch("changeRule", "/:id/rules/:ruleId", {
      params: ruleParams,
      payload: RulePatch,
      success: AgentRule,
      error: [RuleNotFound, TooManyRules, Forbidden]
    }),
    HttpApiEndpoint.post("decideRule", "/:id/rules/:ruleId/decide", {
      params: ruleParams,
      payload: RuleDecision,
      success: AgentRule,
      error: [RuleNotFound, TooManyRules, Forbidden]
    }),
    HttpApiEndpoint.delete("removeRule", "/:id/rules/:ruleId", {
      params: ruleParams,
      error: [RuleNotFound, Forbidden]
    })
  )
  .prefix("/agents")
  .middleware(Authorization) {}

/** Speaking instead of typing (ADR 0026). Anyone may speak; owners and admins set the key. */
export class VoiceApi extends HttpApiGroup.make("voice")
  .add(
    HttpApiEndpoint.get("status", "/status", {
      success: VoiceStatus
    }),
    HttpApiEndpoint.put("saveKey", "/key", {
      payload: ProviderKey,
      error: Forbidden
    }),
    HttpApiEndpoint.delete("removeKey", "/key", {
      error: Forbidden
    }),
    HttpApiEndpoint.post("transcribe", "/transcribe", {
      payload: Transcribe,
      success: Transcript,
      error: [VoiceNotConfigured, VoiceFailed, NothingHeard]
    })
  )
  .prefix("/voice")
  .middleware(Authorization) {}

/** What AI employees did. For owners and admins, who supervise them (ADR 0022). */
export class ActivityApi extends HttpApiGroup.make("activity")
  .add(
    HttpApiEndpoint.get("list", "/", {
      query: ActivityQuery.fields,
      success: ActivityPage,
      error: Forbidden
    }),
    HttpApiEndpoint.get("steps", "/:id/steps", {
      params: { id: Schema.String },
      success: Schema.Array(AgentAction),
      error: [ActionNotFound, Forbidden]
    })
  )
  .prefix("/activity")
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
      error: [DraftNotFound, WhatsAppNotLinked, WhatsAppSendFailed, ...appointmentStepErrors]
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
      error: [DraftNotFound, TelegramNotConnected, TelegramSendFailed, ...appointmentStepErrors]
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
      error: [
        DraftNotFound,
        InstagramNotConnected,
        InstagramWindowClosed,
        InstagramSendFailed,
        ...appointmentStepErrors
      ]
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

const appointmentParams = { id: AppointmentId }
const bookingErrors = [
  CalendarOff,
  SpecialistNotFound,
  ContactNotFound,
  DealNotFound,
  ReferenceNotFound,
  TimeTaken,
  TimeUnavailable
] as const

export class CalendarApi extends HttpApiGroup.make("calendar")
  .add(
    HttpApiEndpoint.get("settings", "/settings", {
      success: CalendarSettings
    }),
    HttpApiEndpoint.put("saveSettings", "/settings", {
      payload: CalendarSettings,
      success: CalendarSettings,
      error: [TimeUnavailable, DealStageNotFound, AgentNotFound, Forbidden]
    }),
    HttpApiEndpoint.get("specialists", "/specialists", {
      success: Schema.Array(Specialist)
    }),
    HttpApiEndpoint.post("createSpecialist", "/specialists", {
      payload: SpecialistDetails,
      success: Specialist,
      error: [ReferenceNotFound, Forbidden]
    }),
    HttpApiEndpoint.patch("updateSpecialist", "/specialists/:id", {
      params: { id: SpecialistId },
      payload: SpecialistDetails,
      success: Specialist,
      error: [SpecialistNotFound, ReferenceNotFound, Forbidden]
    }),
    HttpApiEndpoint.delete("removeSpecialist", "/specialists/:id", {
      params: { id: SpecialistId },
      error: [SpecialistNotFound, Forbidden]
    }),
    HttpApiEndpoint.get("appointments", "/appointments", {
      query: { from: Schema.String, to: Schema.String },
      success: Schema.Array(Appointment),
      error: CalendarOff
    }),
    HttpApiEndpoint.get("appointmentsFor", "/appointments/linked", {
      query: { contactId: Schema.optionalKey(ContactId), dealId: Schema.optionalKey(DealId) },
      success: Schema.Array(Appointment)
    }),
    HttpApiEndpoint.post("slots", "/slots", {
      payload: SlotQuery,
      success: Schema.Array(Slot),
      error: CalendarOff
    }),
    HttpApiEndpoint.post("book", "/appointments", {
      payload: NewAppointment,
      success: Appointment,
      error: bookingErrors
    }),
    HttpApiEndpoint.post("move", "/appointments/:id/move", {
      params: appointmentParams,
      payload: MoveAppointment,
      success: Appointment,
      error: [...bookingErrors, AppointmentNotFound, AppointmentClosed]
    }),
    HttpApiEndpoint.post("record", "/appointments/:id/outcome", {
      params: appointmentParams,
      payload: Schema.Struct({ outcome: AppointmentOutcome }),
      success: Appointment,
      error: [AppointmentNotFound, AppointmentClosed]
    }),
    HttpApiEndpoint.post("cancel", "/appointments/:id/cancel", {
      params: appointmentParams,
      payload: CancelAppointment,
      success: Appointment,
      error: [AppointmentNotFound, AppointmentClosed]
    }),
    HttpApiEndpoint.get("appointment", "/appointments/:id", {
      params: appointmentParams,
      success: Appointment,
      error: AppointmentNotFound
    }),
    HttpApiEndpoint.get("reminders", "/appointments/:id/reminders", {
      params: appointmentParams,
      success: Schema.Array(ReminderLog),
      error: AppointmentNotFound
    }),
    HttpApiEndpoint.post("approve", "/appointments/:id/approve", {
      params: appointmentParams,
      success: Appointment,
      error: [AppointmentNotFound, AppointmentClosed, TimeTaken]
    })
  )
  .prefix("/calendar")
  .middleware(Authorization) {}

export class Api extends HttpApi.make("scope-bot")
  .add(SystemApi)
  .add(AuthApi)
  .add(WebAuthApi)
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
  .add(CoachingApi)
  .add(VoiceApi)
  .add(ActivityApi)
  .add(SearchApi)
  .add(ModelsApi)
  .add(ProvidersApi)
  .add(WhatsAppApi)
  .add(TelegramApi)
  .add(InstagramApi)
  .add(CalendarApi)
  .annotateMerge(OpenApi.annotations({ title: "Scope Bot API" })) {}
