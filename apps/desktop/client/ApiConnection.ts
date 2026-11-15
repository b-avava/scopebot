import { Api } from "@scope-bot/contracts"
import {
  ActivityId,
  ActivityPatch,
  ActivityQuery,
  AgentId,
  AgentSettings,
  AppointmentId,
  AppointmentOutcome,
  ApprovalDecision,
  ApprovalId,
  type AuthSession,
  BusinessProfile,
  CalendarSettings,
  ChangePassword,
  ChannelSettings,
  ConnectTelegram,
  ContactDetails,
  ContactId,
  ConversationId,
  CreateAgent,
  DealDetails,
  DealId,
  DecideSuggestion,
  DepartmentDetails,
  DepartmentId,
  DraftRule,
  EditQuestion,
  GiveFeedback,
  type InstagramLogin,
  JoinTeam,
  LinkWhatsApp,
  Login,
  MessageId,
  MoveAppointment,
  NewActivity,
  NewAppointment,
  NewInvite,
  NewRule,
  PinAgent,
  PipelineDetails,
  PipelineId,
  ProviderId,
  ProviderKey,
  ProviderPreferences,
  Register,
  RenameConversation,
  RuleDecision,
  RuleId,
  RulePatch,
  SendDraft,
  SendMessage,
  SendWhatsApp,
  ServiceDetails,
  ServiceId,
  ServicePreview,
  SideQuestion,
  SlotQuery,
  SpecialistDetails,
  SpecialistId,
  Transcribe,
  UserId,
  WhatsAppSettings
} from "@scope-bot/domain"
import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import type { BridgeError, BridgeResult, ScopeBotBridge, ServerStatus } from "../preload/bridge.ts"

type Bridged<K extends keyof ScopeBotBridge> = ScopeBotBridge[K] extends (...args: infer _) => Promise<infer R>
  ? Effect.Effect<R>
  : never

const errorCodes: Record<string, BridgeError> = {
  SchemaError: "invalid",
  AgentNotFound: "not-found",
  ContactNotFound: "contact-not-found",
  DepartmentNotFound: "department-not-found",
  DealNotFound: "deal-not-found",
  DealStageNotFound: "invalid",
  ServiceNotFound: "gone",
  ActivityNotFound: "gone",
  ApprovalNotPending: "gone",
  ActionNotFound: "gone",
  StageInUse: "stage-in-use",
  PipelineInvalid: "pipeline-invalid",
  AgentPaused: "paused",
  ModelNotConfigured: "model-not-configured",
  ModelRefused: "model-refused",
  ModelFailed: "model-failed",
  ConversationNotFound: "not-found",
  ConversationRequired: "invalid",
  ProviderLoginFailed: "provider-login-failed",
  ReferenceNotFound: "gone",
  UserNotFound: "gone",
  Unauthorized: "signed-out",
  WrongCredentials: "wrong-credentials",
  TooManyAttempts: "too-many-attempts",
  EmailTaken: "email-taken",
  SignupClosed: "signup-closed",
  SetupCodeInvalid: "setup-code-invalid",
  Forbidden: "forbidden",
  InviteInvalid: "invite-invalid",
  DraftNotFound: "gone",
  SuggestionNotFound: "gone",
  WhatsAppNotLinked: "whatsapp-not-linked",
  WhatsAppNeedsAgent: "whatsapp-needs-agent",
  WhatsAppSendFailed: "whatsapp-send-failed",
  TelegramTokenInvalid: "telegram-token-invalid",
  TelegramNotConnected: "telegram-not-connected",
  TelegramNeedsAgent: "telegram-needs-agent",
  TelegramSendFailed: "telegram-send-failed",
  InstagramNotConfigured: "instagram-not-configured",
  InstagramNotConnected: "instagram-not-connected",
  InstagramNeedsAgent: "instagram-needs-agent",
  InstagramWindowClosed: "instagram-window-closed",
  InstagramSendFailed: "instagram-send-failed",
  CalendarOff: "calendar-off",
  SpecialistNotFound: "gone",
  AppointmentNotFound: "gone",
  AppointmentClosed: "appointment-closed",
  TimeTaken: "time-taken",
  TimeUnavailable: "time-unavailable",
  CannotAnswerAgain: "cannot-answer-again",
  RuleNotFound: "gone",
  TooManyRules: "too-many-rules",
  VoiceNotConfigured: "voice-not-configured",
  VoiceFailed: "voice-failed",
  NothingHeard: "nothing-heard"
}

/** A key the speech provider rejected needs a person, not another try, so it has a code of its own. */
const codeOf = (error: { readonly _tag: string; readonly reason?: unknown }): BridgeError =>
  error._tag === "VoiceFailed" && error.reason === "key_rejected"
    ? "voice-key-rejected"
    : (errorCodes[error._tag] ?? "offline")

const toResult = <A, E extends { readonly _tag: string }>(
  effect: Effect.Effect<A, E>
): Effect.Effect<BridgeResult<A>> =>
  effect.pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error) => Effect.succeed({ ok: false as const, error: codeOf(error) }))
  )

// Everything below comes from the renderer, so it is validated before use.
const decodeCalendarSettings = Schema.decodeUnknownEffect(CalendarSettings)
const decodeSpecialist = Schema.decodeUnknownEffect(SpecialistDetails)
const decodeSpecialistId = Schema.decodeUnknownEffect(SpecialistId)
const decodeAppointmentId = Schema.decodeUnknownEffect(AppointmentId)
const decodeSuggestionDecision = Schema.decodeUnknownEffect(DecideSuggestion)
const decodeNewAppointment = Schema.decodeUnknownEffect(NewAppointment)
const decodeMove = Schema.decodeUnknownEffect(MoveAppointment)
const decodeOutcome = Schema.decodeUnknownEffect(AppointmentOutcome)
const decodeSlotQuery = Schema.decodeUnknownEffect(SlotQuery)
const decodeText = Schema.decodeUnknownEffect(Schema.String)
const decodeLinks = Schema.decodeUnknownEffect(
  Schema.Struct({ contactId: Schema.optionalKey(ContactId), dealId: Schema.optionalKey(DealId) })
)
const decodeId = Schema.decodeUnknownEffect(AgentId)
const decodeConversation = Schema.decodeUnknownEffect(ConversationId)
const decodeRename = Schema.decodeUnknownEffect(RenameConversation)

const chatParams = (id: unknown, conversationId: unknown) =>
  Effect.all({ id: decodeId(id), conversationId: decodeConversation(conversationId) })
const decodeCreate = Schema.decodeUnknownEffect(CreateAgent)
const decodeSettings = Schema.decodeUnknownEffect(AgentSettings)
const decodeMessage = Schema.decodeUnknownEffect(SendMessage)
const decodeQuestion = Schema.decodeUnknownEffect(SideQuestion)
const decodeBusiness = Schema.decodeUnknownEffect(BusinessProfile)
const decodePin = Schema.decodeUnknownEffect(PinAgent)
const decodeContactId = Schema.decodeUnknownEffect(ContactId)
const decodeContact = Schema.decodeUnknownEffect(ContactDetails)
const decodeDepartmentId = Schema.decodeUnknownEffect(DepartmentId)
const decodeDepartment = Schema.decodeUnknownEffect(DepartmentDetails)
const decodeDealId = Schema.decodeUnknownEffect(DealId)
const decodeDeal = Schema.decodeUnknownEffect(DealDetails)
const decodePipelineId = Schema.decodeUnknownEffect(PipelineId)
const decodePipeline = Schema.decodeUnknownEffect(PipelineDetails)
const decodeServiceId = Schema.decodeUnknownEffect(ServiceId)
const decodeService = Schema.decodeUnknownEffect(ServiceDetails)
const decodeActivityId = Schema.decodeUnknownEffect(ActivityId)
const decodeNewActivity = Schema.decodeUnknownEffect(NewActivity)
const decodeActivityPatch = Schema.decodeUnknownEffect(ActivityPatch)
const decodeApprovalId = Schema.decodeUnknownEffect(ApprovalId)
const decodeDecision = Schema.decodeUnknownEffect(ApprovalDecision)
const decodePreview = Schema.decodeUnknownEffect(ServicePreview)
const decodeQuery = Schema.decodeUnknownEffect(Schema.String)
const decodeProvider = Schema.decodeUnknownEffect(ProviderId)
const decodeKey = Schema.decodeUnknownEffect(ProviderKey)
const decodePreferences = Schema.decodeUnknownEffect(ProviderPreferences)
const decodeRegister = Schema.decodeUnknownEffect(Register)
const decodeLogin = Schema.decodeUnknownEffect(Login)
const decodeJoin = Schema.decodeUnknownEffect(JoinTeam)
const decodeChangePassword = Schema.decodeUnknownEffect(ChangePassword)
const decodeInvite = Schema.decodeUnknownEffect(NewInvite)
const decodeUserId = Schema.decodeUnknownEffect(UserId)
const decodeWhatsAppSettings = Schema.decodeUnknownEffect(WhatsAppSettings)
const decodeLink = Schema.decodeUnknownEffect(LinkWhatsApp)
const decodeWhatsAppText = Schema.decodeUnknownEffect(SendWhatsApp)
const decodeDraft = Schema.decodeUnknownEffect(SendDraft)
const decodeMessageId = Schema.decodeUnknownEffect(MessageId)
const decodeChannelSettings = Schema.decodeUnknownEffect(ChannelSettings)
const decodeConnectTelegram = Schema.decodeUnknownEffect(ConnectTelegram)
const decodeActivityQuery = Schema.decodeUnknownEffect(ActivityQuery)
const decodeEditQuestion = Schema.decodeUnknownEffect(EditQuestion)
const decodeVersion = Schema.decodeUnknownEffect(Schema.Int)
const decodeTranscribe = Schema.decodeUnknownEffect(Transcribe)
const decodeVoiceKey = Schema.decodeUnknownEffect(ProviderKey)
const decodeFeedback = Schema.decodeUnknownEffect(GiveFeedback)
const decodeRuleId = Schema.decodeUnknownEffect(RuleId)
const decodeNewRule = Schema.decodeUnknownEffect(NewRule)
const decodeDraftRule = Schema.decodeUnknownEffect(DraftRule)
const decodeRulePatch = Schema.decodeUnknownEffect(RulePatch)
const decodeRuleDecision = Schema.decodeUnknownEffect(RuleDecision)

const ruleParams = (id: unknown, ruleId: unknown) => Effect.all({ id: decodeId(id), ruleId: decodeRuleId(ruleId) })

/** Everything the bridge asks of the server. The Electron main process and the browser share it (ADR 0029). */
export interface ApiConnection {
  readonly status: Effect.Effect<ServerStatus>
  readonly getAccount: Bridged<"getAccount">
  readonly getAuthOptions: Bridged<"getAuthOptions">
  register(input: unknown): Bridged<"register">
  login(input: unknown): Bridged<"login">
  joinTeam(input: unknown): Bridged<"joinTeam">
  readonly logout: Bridged<"logout">
  changePassword(input: unknown): Bridged<"changePassword">
  readonly listTeam: Bridged<"listTeam">
  createInvite(input: unknown): Bridged<"createInvite">
  removeMember(id: unknown): Bridged<"removeMember">
  readonly getBusiness: Bridged<"getBusiness">
  saveBusiness(business: unknown): Bridged<"saveBusiness">
  readonly listAgents: Bridged<"listAgents">
  readonly listLastMessages: Bridged<"listLastMessages">
  readonly listAgentStatuses: Bridged<"listAgentStatuses">
  createAgent(input: unknown): Bridged<"createAgent">
  updateAgent(id: unknown, settings: unknown): Bridged<"updateAgent">
  removeAgent(id: unknown): Bridged<"removeAgent">
  pinAgent(id: unknown, pinned: unknown): Bridged<"pinAgent">
  readonly listContacts: Bridged<"listContacts">
  createContact(details: unknown): Bridged<"createContact">
  updateContact(id: unknown, details: unknown): Bridged<"updateContact">
  removeContact(id: unknown): Bridged<"removeContact">
  readonly listDepartments: Bridged<"listDepartments">
  createDepartment(details: unknown): Bridged<"createDepartment">
  updateDepartment(id: unknown, details: unknown): Bridged<"updateDepartment">
  removeDepartment(id: unknown): Bridged<"removeDepartment">
  readonly listPipelines: Bridged<"listPipelines">
  updatePipeline(id: unknown, details: unknown): Bridged<"updatePipeline">
  readonly listServices: Bridged<"listServices">
  createService(details: unknown): Bridged<"createService">
  updateService(id: unknown, details: unknown): Bridged<"updateService">
  removeService(id: unknown): Bridged<"removeService">
  readonly listActivities: Bridged<"listActivities">
  createActivity(input: unknown): Bridged<"createActivity">
  updateActivity(id: unknown, patch: unknown): Bridged<"updateActivity">
  removeActivity(id: unknown): Bridged<"removeActivity">
  readonly listApprovals: Bridged<"listApprovals">
  decideApproval(id: unknown, decision: unknown): Bridged<"decideApproval">
  previewService(input: unknown): Bridged<"previewService">
  summarizeContact(id: unknown): Bridged<"summarizeContact">
  readonly listDeals: Bridged<"listDeals">
  createDeal(details: unknown): Bridged<"createDeal">
  updateDeal(id: unknown, details: unknown): Bridged<"updateDeal">
  removeDeal(id: unknown): Bridged<"removeDeal">
  search(query: unknown): Bridged<"search">
  listConversations(id: unknown): Bridged<"listConversations">
  createConversation(id: unknown): Bridged<"createConversation">
  renameConversation(id: unknown, conversationId: unknown, title: unknown): Bridged<"renameConversation">
  removeConversation(id: unknown, conversationId: unknown): Bridged<"removeConversation">
  listMessages(id: unknown, conversationId: unknown): Bridged<"listMessages">
  sendMessage(id: unknown, conversationId: unknown, text: unknown, images: unknown): Bridged<"sendMessage">
  askAgent(id: unknown, conversationId: unknown, text: unknown): Bridged<"askAgent">
  listActions(id: unknown): Bridged<"listActions">
  getChatState(id: unknown, conversationId: unknown): Bridged<"getChatState">
  resumeAgent(id: unknown, conversationId: unknown): Bridged<"resumeAgent">
  readonly listModels: Bridged<"listModels">
  readonly getPreferences: Bridged<"getPreferences">
  savePreferences(preferences: unknown): Bridged<"savePreferences">
  saveProviderKey(id: unknown, input: unknown): Bridged<"saveProviderKey">
  removeProviderKey(id: unknown): Bridged<"removeProviderKey">
  loginProvider(id: unknown): Bridged<"loginProvider">
  readonly getWhatsApp: Bridged<"getWhatsApp">
  saveWhatsAppSettings(settings: unknown): Bridged<"saveWhatsAppSettings">
  linkWhatsApp(phone: unknown): Bridged<"linkWhatsApp">
  readonly cancelWhatsAppLink: Bridged<"cancelWhatsAppLink">
  readonly unlinkWhatsApp: Bridged<"unlinkWhatsApp">
  readonly listWhatsAppChats: Bridged<"listWhatsAppChats">
  listWhatsAppMessages(chatId: unknown): Bridged<"listWhatsAppMessages">
  sendWhatsApp(chatId: unknown, text: unknown): Bridged<"sendWhatsApp">
  sendWhatsAppDraft(id: unknown, text: unknown): Bridged<"sendWhatsAppDraft">
  discardWhatsAppDraft(id: unknown): Bridged<"discardWhatsAppDraft">
  readonly getTelegram: Bridged<"getTelegram">
  saveTelegramSettings(settings: unknown): Bridged<"saveTelegramSettings">
  connectTelegram(token: unknown): Bridged<"connectTelegram">
  readonly disconnectTelegram: Bridged<"disconnectTelegram">
  readonly listTelegramChats: Bridged<"listTelegramChats">
  listTelegramMessages(chatId: unknown): Bridged<"listTelegramMessages">
  sendTelegram(chatId: unknown, text: unknown): Bridged<"sendTelegram">
  sendTelegramDraft(id: unknown, text: unknown): Bridged<"sendTelegramDraft">
  discardTelegramDraft(id: unknown): Bridged<"discardTelegramDraft">
  resumeWhatsAppChat(chatId: unknown): Bridged<"resumeWhatsAppChat">
  resumeTelegramChat(chatId: unknown): Bridged<"resumeTelegramChat">
  readonly getInstagram: Bridged<"getInstagram">
  saveInstagramSettings(settings: unknown): Bridged<"saveInstagramSettings">
  /** The address to sign in at. Main opens it, so the renderer never handles it. */
  readonly instagramLogin: Effect.Effect<BridgeResult<InstagramLogin>>
  readonly checkInstagram: Bridged<"checkInstagram">
  readonly disconnectInstagram: Bridged<"disconnectInstagram">
  readonly listInstagramChats: Bridged<"listInstagramChats">
  listInstagramMessages(chatId: unknown): Bridged<"listInstagramMessages">
  sendInstagram(chatId: unknown, text: unknown): Bridged<"sendInstagram">
  sendInstagramDraft(id: unknown, text: unknown): Bridged<"sendInstagramDraft">
  discardInstagramDraft(id: unknown): Bridged<"discardInstagramDraft">
  resumeInstagramChat(chatId: unknown): Bridged<"resumeInstagramChat">
  readonly getCalendarSettings: Bridged<"getCalendarSettings">
  saveCalendarSettings(settings: unknown): Bridged<"saveCalendarSettings">
  readonly listSpecialists: Bridged<"listSpecialists">
  createSpecialist(details: unknown): Bridged<"createSpecialist">
  updateSpecialist(id: unknown, details: unknown): Bridged<"updateSpecialist">
  removeSpecialist(id: unknown): Bridged<"removeSpecialist">
  listAppointments(from: unknown, to: unknown): Bridged<"listAppointments">
  listLinkedAppointments(links: unknown): Bridged<"listLinkedAppointments">
  findSlots(query: unknown): Bridged<"findSlots">
  bookAppointment(input: unknown): Bridged<"bookAppointment">
  moveAppointment(id: unknown, to: unknown): Bridged<"moveAppointment">
  recordAppointment(id: unknown, outcome: unknown): Bridged<"recordAppointment">
  cancelAppointment(id: unknown, reason: unknown): Bridged<"cancelAppointment">
  approveAppointment(id: unknown): Bridged<"approveAppointment">
  listAppointmentReminders(id: unknown): Bridged<"listAppointmentReminders">
  getAppointment(id: unknown): Bridged<"getAppointment">
  listActivity(query: unknown): Bridged<"listActivity">
  listActionSteps(id: unknown): Bridged<"listActionSteps">
  decideSuggestion(
    id: unknown,
    conversationId: unknown,
    messageId: unknown,
    decision: unknown
  ): Bridged<"decideSuggestion">
  listChatActions(id: unknown, conversationId: unknown): Bridged<"listChatActions">
  readonly voiceStatus: Bridged<"voiceStatus">
  saveVoiceKey(key: unknown): Bridged<"saveVoiceKey">
  readonly removeVoiceKey: Bridged<"removeVoiceKey">
  transcribe(input: unknown): Bridged<"transcribe">
  watchAnswer(id: unknown, conversationId: unknown, after: unknown): Bridged<"watchAnswer">
  stopAnswer(id: unknown, conversationId: unknown): Bridged<"stopAnswer">
  answerAgain(id: unknown, conversationId: unknown): Bridged<"answerAgain">
  editQuestion(id: unknown, conversationId: unknown, text: unknown): Bridged<"editQuestion">
  giveFeedback(id: unknown, conversationId: unknown, messageId: unknown, input: unknown): Bridged<"giveFeedback">
  listFeedback(id: unknown, conversationId: unknown): Bridged<"listFeedback">
  listRules(id: unknown): Bridged<"listRules">
  addRule(id: unknown, input: unknown): Bridged<"addRule">
  draftRule(id: unknown, input: unknown): Bridged<"draftRule">
  changeRule(id: unknown, ruleId: unknown, patch: unknown): Bridged<"changeRule">
  decideRule(id: unknown, ruleId: unknown, accept: unknown): Bridged<"decideRule">
  removeRule(id: unknown, ruleId: unknown): Bridged<"removeRule">
}

/** Where the session lives: a token the caller keeps safe, or a cookie the browser keeps from the page. */
export type Session =
  | {
      readonly kind: "token"
      readonly store: {
        readonly get: Effect.Effect<string | null>
        set(token: string | null): Effect.Effect<void>
      }
    }
  | { readonly kind: "cookie" }

/** Talks to the API at `url`. Needs an `HttpClient`: fetch works in Node and in the browser. */
export const makeApiConnection = (options: { readonly url: string; readonly session: Session }) =>
  Effect.gen(function* () {
    const { url, session } = options
    // A browser sends its cookie by itself, so only a token is added here.
    const store = session.kind === "token" ? session.store : null
    const client = yield* HttpApiClient.make(Api, {
      transformClient: (http) =>
        http.pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl(url)),
          HttpClient.mapRequestEffect((request) =>
            store === null
              ? Effect.succeed(request)
              : store.get.pipe(
                  Effect.map((current) =>
                    current === null ? request : HttpClientRequest.bearerToken(request, current)
                  )
                )
          )
        )
    })

    const forget = store === null ? Effect.void : store.set(null)

    /** Without a token there is no session to ask about. A cookie cannot be seen, so the server is asked. */
    const maybeSignedIn =
      store === null ? Effect.succeed(true) : store.get.pipe(Effect.map((current) => current !== null))

    /** Keeps the token with the caller and tells the page only who signed in. */
    const keepToken =
      (tokens: NonNullable<typeof store>) =>
      <E>(signedIn: Effect.Effect<AuthSession, E>) =>
        signedIn.pipe(
          Effect.tap(({ token }) => tokens.set(token)),
          Effect.map(({ account }) => account)
        )

    /** A token comes back in the answer; a browser gets a cookie instead and only the account (ADR 0029). */
    const signIn =
      store === null
        ? {
            register: (payload: Register) => client.webAuth.register({ payload }),
            login: (payload: Login) => client.webAuth.login({ payload }),
            join: (payload: JoinTeam) => client.webAuth.join({ payload })
          }
        : {
            register: (payload: Register) => keepToken(store)(client.auth.register({ payload })),
            login: (payload: Login) => keepToken(store)(client.auth.login({ payload })),
            join: (payload: JoinTeam) => keepToken(store)(client.auth.join({ payload }))
          }

    const status = client.system.health().pipe(
      Effect.timeout("2 seconds"),
      Effect.as<ServerStatus>({ state: "online", url }),
      Effect.catch(() => Effect.succeed<ServerStatus>({ state: "offline", url }))
    )

    return {
      status,
      getAccount: maybeSignedIn.pipe(
        Effect.flatMap((maybe) =>
          maybe
            ? toResult(client.account.me().pipe(Effect.catchTag("Unauthorized", () => forget.pipe(Effect.as(null)))))
            : Effect.succeed({ ok: true as const, value: null })
        )
      ),
      getAuthOptions: toResult(client.auth.options()),
      register: (input) => toResult(decodeRegister(input).pipe(Effect.flatMap(signIn.register))),
      login: (input) => toResult(decodeLogin(input).pipe(Effect.flatMap(signIn.login))),
      joinTeam: (input) => toResult(decodeJoin(input).pipe(Effect.flatMap(signIn.join))),
      // A token is dropped even when the server cannot be reached. A cookie only the server can delete.
      logout: client.account
        .logout()
        .pipe(Effect.ignore, Effect.andThen(forget), Effect.as({ ok: true as const, value: undefined })),
      changePassword: (input) =>
        toResult(
          decodeChangePassword(input).pipe(
            Effect.flatMap((payload) => client.account.changePassword({ payload })),
            Effect.asVoid
          )
        ),
      listTeam: toResult(client.team.list()),
      createInvite: (input) =>
        toResult(decodeInvite(input).pipe(Effect.flatMap((payload) => client.team.invite({ payload })))),
      removeMember: (id) =>
        toResult(
          decodeUserId(id).pipe(
            Effect.flatMap((id) => client.team.remove({ params: { id } })),
            Effect.asVoid
          )
        ),
      getBusiness: toResult(client.business.get()),
      saveBusiness: (business) =>
        toResult(decodeBusiness(business).pipe(Effect.flatMap((payload) => client.business.save({ payload })))),
      listAgents: toResult(client.agents.list()),
      listLastMessages: toResult(client.agents.lastMessages()),
      listAgentStatuses: toResult(client.agents.statuses()),
      createAgent: (input) =>
        toResult(decodeCreate(input).pipe(Effect.flatMap((payload) => client.agents.create({ payload })))),
      updateAgent: (id, settings) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeId(id) }
            return yield* client.agents.update({ params, payload: yield* decodeSettings(settings) })
          })
        ),
      pinAgent: (id, pinned) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeId(id) }
            return yield* client.agents.pin({ params, payload: yield* decodePin({ pinned }) })
          })
        ),
      listContacts: toResult(client.contacts.list()),
      createContact: (details) =>
        toResult(decodeContact(details).pipe(Effect.flatMap((payload) => client.contacts.create({ payload })))),
      updateContact: (id, details) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeContactId(id) }
            return yield* client.contacts.update({ params, payload: yield* decodeContact(details) })
          })
        ),
      removeContact: (id) =>
        toResult(
          decodeContactId(id).pipe(
            Effect.flatMap((id) => client.contacts.remove({ params: { id } })),
            Effect.asVoid
          )
        ),
      listDepartments: toResult(client.departments.list()),
      createDepartment: (details) =>
        toResult(decodeDepartment(details).pipe(Effect.flatMap((payload) => client.departments.create({ payload })))),
      updateDepartment: (id, details) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeDepartmentId(id) }
            return yield* client.departments.update({ params, payload: yield* decodeDepartment(details) })
          })
        ),
      removeDepartment: (id) =>
        toResult(
          decodeDepartmentId(id).pipe(
            Effect.flatMap((id) => client.departments.remove({ params: { id } })),
            Effect.asVoid
          )
        ),
      listPipelines: toResult(client.pipelines.list()),
      updatePipeline: (id, details) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodePipelineId(id) }
            return yield* client.pipelines.update({ params, payload: yield* decodePipeline(details) })
          })
        ),
      listServices: toResult(client.services.list()),
      createService: (details) =>
        toResult(decodeService(details).pipe(Effect.flatMap((payload) => client.services.create({ payload })))),
      updateService: (id, details) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeServiceId(id) }
            return yield* client.services.update({ params, payload: yield* decodeService(details) })
          })
        ),
      removeService: (id) =>
        toResult(
          decodeServiceId(id).pipe(
            Effect.flatMap((id) => client.services.remove({ params: { id } })),
            Effect.asVoid
          )
        ),
      listActivities: toResult(client.activities.list()),
      createActivity: (input) =>
        toResult(decodeNewActivity(input).pipe(Effect.flatMap((payload) => client.activities.create({ payload })))),
      updateActivity: (id, patch) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeActivityId(id) }
            return yield* client.activities.update({ params, payload: yield* decodeActivityPatch(patch) })
          })
        ),
      removeActivity: (id) =>
        toResult(
          decodeActivityId(id).pipe(
            Effect.flatMap((id) => client.activities.remove({ params: { id } })),
            Effect.asVoid
          )
        ),
      listApprovals: toResult(client.approvals.list()),
      decideApproval: (id, decision) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeApprovalId(id) }
            return yield* client.approvals.decide({ params, payload: yield* decodeDecision(decision) })
          })
        ),
      previewService: (input) =>
        toResult(decodePreview(input).pipe(Effect.flatMap((payload) => client.assistant.previewService({ payload })))),
      summarizeContact: (id) =>
        toResult(
          decodeContactId(id).pipe(Effect.flatMap((id) => client.assistant.summarizeContact({ params: { id } })))
        ),
      listDeals: toResult(client.deals.list()),
      createDeal: (details) =>
        toResult(decodeDeal(details).pipe(Effect.flatMap((payload) => client.deals.create({ payload })))),
      updateDeal: (id, details) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeDealId(id) }
            return yield* client.deals.update({ params, payload: yield* decodeDeal(details) })
          })
        ),
      removeDeal: (id) =>
        toResult(
          decodeDealId(id).pipe(
            Effect.flatMap((id) => client.deals.remove({ params: { id } })),
            Effect.asVoid
          )
        ),
      search: (query) => toResult(decodeQuery(query).pipe(Effect.flatMap((q) => client.search.run({ query: { q } })))),
      removeAgent: (id) =>
        toResult(
          decodeId(id).pipe(
            Effect.flatMap((id) => client.agents.remove({ params: { id } })),
            Effect.asVoid
          )
        ),
      listConversations: (id) =>
        toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.conversations({ params: { id } })))),
      createConversation: (id) =>
        toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.createConversation({ params: { id } })))),
      renameConversation: (id, conversationId, title) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* chatParams(id, conversationId)
            return yield* client.chat.renameConversation({ params, payload: yield* decodeRename({ title }) })
          })
        ),
      removeConversation: (id, conversationId) =>
        toResult(
          chatParams(id, conversationId).pipe(
            Effect.flatMap((params) => client.chat.removeConversation({ params })),
            Effect.asVoid
          )
        ),
      listMessages: (id, conversationId) =>
        toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.messages({ params })))),
      sendMessage: (id, conversationId, text, images) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* chatParams(id, conversationId)
            return yield* client.chat.send({ params, payload: yield* decodeMessage({ text, images }) })
          })
        ),
      askAgent: (id, conversationId, text) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* chatParams(id, conversationId)
            return yield* client.chat.ask({ params, payload: yield* decodeQuestion({ text }) })
          })
        ),
      listActions: (id) => toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.actions({ params: { id } })))),
      getChatState: (id, conversationId) =>
        toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.state({ params })))),
      resumeAgent: (id, conversationId) =>
        toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.resume({ params })))),
      listModels: toResult(client.models.list()),
      getPreferences: toResult(client.providers.preferences()),
      savePreferences: (preferences) =>
        toResult(
          decodePreferences(preferences).pipe(
            Effect.flatMap((payload) => client.providers.savePreferences({ payload }))
          )
        ),
      saveProviderKey: (id, input) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeProvider(id) }
            yield* client.providers.saveKey({ params, payload: yield* decodeKey(input) })
          })
        ),
      removeProviderKey: (id) =>
        toResult(
          decodeProvider(id).pipe(
            Effect.flatMap((id) => client.providers.removeKey({ params: { id } })),
            Effect.asVoid
          )
        ),
      loginProvider: (id) =>
        toResult(
          decodeProvider(id).pipe(
            Effect.flatMap((id) => client.providers.login({ params: { id } })),
            Effect.asVoid
          )
        ),
      getWhatsApp: toResult(client.whatsapp.status()),
      saveWhatsAppSettings: (settings) =>
        toResult(
          decodeWhatsAppSettings(settings).pipe(Effect.flatMap((payload) => client.whatsapp.saveSettings({ payload })))
        ),
      linkWhatsApp: (phone) =>
        toResult(
          decodeLink(phone === null || phone === undefined ? {} : { phone }).pipe(
            Effect.flatMap((payload) => client.whatsapp.link({ payload }))
          )
        ),
      cancelWhatsAppLink: toResult(client.whatsapp.cancelLink()),
      unlinkWhatsApp: toResult(client.whatsapp.unlink()),
      listWhatsAppChats: toResult(client.whatsapp.chats()),
      listWhatsAppMessages: (chatId) =>
        toResult(decodeConversation(chatId).pipe(Effect.flatMap((id) => client.whatsapp.messages({ params: { id } })))),
      sendWhatsApp: (chatId, text) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeConversation(chatId) }
            return yield* client.whatsapp.send({ params, payload: yield* decodeWhatsAppText({ text }) })
          })
        ),
      sendWhatsAppDraft: (id, text) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeMessageId(id) }
            const payload = yield* decodeDraft(text === null || text === undefined ? {} : { text })
            return yield* client.whatsapp.sendDraft({ params, payload })
          })
        ),
      discardWhatsAppDraft: (id) =>
        toResult(decodeMessageId(id).pipe(Effect.flatMap((id) => client.whatsapp.discardDraft({ params: { id } })))),
      getTelegram: toResult(client.telegram.status()),
      saveTelegramSettings: (settings) =>
        toResult(
          decodeChannelSettings(settings).pipe(Effect.flatMap((payload) => client.telegram.saveSettings({ payload })))
        ),
      connectTelegram: (token) =>
        toResult(
          decodeConnectTelegram({ token: typeof token === "string" ? token.trim() : token }).pipe(
            Effect.flatMap((payload) => client.telegram.connect({ payload }))
          )
        ),
      disconnectTelegram: toResult(client.telegram.disconnect()),
      listTelegramChats: toResult(client.telegram.chats()),
      listTelegramMessages: (chatId) =>
        toResult(decodeConversation(chatId).pipe(Effect.flatMap((id) => client.telegram.messages({ params: { id } })))),
      sendTelegram: (chatId, text) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeConversation(chatId) }
            return yield* client.telegram.send({ params, payload: yield* decodeWhatsAppText({ text }) })
          })
        ),
      sendTelegramDraft: (id, text) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeMessageId(id) }
            const payload = yield* decodeDraft(text === null || text === undefined ? {} : { text })
            return yield* client.telegram.sendDraft({ params, payload })
          })
        ),
      discardTelegramDraft: (id) =>
        toResult(decodeMessageId(id).pipe(Effect.flatMap((id) => client.telegram.discardDraft({ params: { id } })))),
      resumeWhatsAppChat: (chatId) =>
        toResult(
          decodeConversation(chatId).pipe(
            Effect.flatMap((id) => client.whatsapp.resume({ params: { id } })),
            Effect.asVoid
          )
        ),
      getInstagram: toResult(client.instagram.status()),
      saveInstagramSettings: (settings) =>
        toResult(
          decodeChannelSettings(settings).pipe(Effect.flatMap((payload) => client.instagram.saveSettings({ payload })))
        ),
      instagramLogin: toResult(client.instagram.login()),
      checkInstagram: toResult(client.instagram.checkReachable()),
      disconnectInstagram: toResult(client.instagram.disconnect()),
      listInstagramChats: toResult(client.instagram.chats()),
      listInstagramMessages: (chatId) =>
        toResult(
          decodeConversation(chatId).pipe(Effect.flatMap((id) => client.instagram.messages({ params: { id } })))
        ),
      sendInstagram: (chatId, text) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeConversation(chatId) }
            return yield* client.instagram.send({ params, payload: yield* decodeWhatsAppText({ text }) })
          })
        ),
      sendInstagramDraft: (id, text) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeMessageId(id) }
            const payload = yield* decodeDraft(text === null || text === undefined ? {} : { text })
            return yield* client.instagram.sendDraft({ params, payload })
          })
        ),
      discardInstagramDraft: (id) =>
        toResult(decodeMessageId(id).pipe(Effect.flatMap((id) => client.instagram.discardDraft({ params: { id } })))),
      resumeInstagramChat: (chatId) =>
        toResult(
          decodeConversation(chatId).pipe(
            Effect.flatMap((id) => client.instagram.resume({ params: { id } })),
            Effect.asVoid
          )
        ),
      resumeTelegramChat: (chatId) =>
        toResult(
          decodeConversation(chatId).pipe(
            Effect.flatMap((id) => client.telegram.resume({ params: { id } })),
            Effect.asVoid
          )
        ),
      getCalendarSettings: toResult(client.calendar.settings()),
      saveCalendarSettings: (settings) =>
        toResult(
          decodeCalendarSettings(settings).pipe(Effect.flatMap((payload) => client.calendar.saveSettings({ payload })))
        ),
      listSpecialists: toResult(client.calendar.specialists()),
      createSpecialist: (details) =>
        toResult(
          decodeSpecialist(details).pipe(Effect.flatMap((payload) => client.calendar.createSpecialist({ payload })))
        ),
      updateSpecialist: (id, details) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeSpecialistId(id) }
            return yield* client.calendar.updateSpecialist({ params, payload: yield* decodeSpecialist(details) })
          })
        ),
      removeSpecialist: (id) =>
        toResult(
          decodeSpecialistId(id).pipe(
            Effect.flatMap((id) => client.calendar.removeSpecialist({ params: { id } })),
            Effect.asVoid
          )
        ),
      listAppointments: (from, to) =>
        toResult(
          Effect.all([decodeText(from), decodeText(to)]).pipe(
            Effect.flatMap(([from, to]) => client.calendar.appointments({ query: { from, to } }))
          )
        ),
      listLinkedAppointments: (links) =>
        toResult(decodeLinks(links).pipe(Effect.flatMap((query) => client.calendar.appointmentsFor({ query })))),
      findSlots: (query) =>
        toResult(decodeSlotQuery(query).pipe(Effect.flatMap((payload) => client.calendar.slots({ payload })))),
      bookAppointment: (input) =>
        toResult(decodeNewAppointment(input).pipe(Effect.flatMap((payload) => client.calendar.book({ payload })))),
      moveAppointment: (id, to) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeAppointmentId(id) }
            return yield* client.calendar.move({ params, payload: yield* decodeMove(to) })
          })
        ),
      recordAppointment: (id, outcome) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeAppointmentId(id) }
            return yield* client.calendar.record({ params, payload: { outcome: yield* decodeOutcome(outcome) } })
          })
        ),
      cancelAppointment: (id, reason) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeAppointmentId(id) }
            return yield* client.calendar.cancel({ params, payload: { reason: yield* decodeText(reason) } })
          })
        ),
      approveAppointment: (id) =>
        toResult(decodeAppointmentId(id).pipe(Effect.flatMap((id) => client.calendar.approve({ params: { id } })))),
      getAppointment: (id) =>
        toResult(decodeAppointmentId(id).pipe(Effect.flatMap((id) => client.calendar.appointment({ params: { id } })))),
      decideSuggestion: (id, conversationId, messageId, decision) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* chatParams(id, conversationId)
            return yield* client.chat.decide({
              params: { ...params, messageId: yield* decodeMessageId(messageId) },
              payload: yield* decodeSuggestionDecision({ decision })
            })
          })
        ),
      listChatActions: (id, conversationId) =>
        toResult(
          chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.conversationActions({ params })))
        ),
      voiceStatus: toResult(client.voice.status()),
      saveVoiceKey: (key) =>
        toResult(decodeVoiceKey({ key }).pipe(Effect.flatMap((payload) => client.voice.saveKey({ payload })))),
      removeVoiceKey: toResult(client.voice.removeKey()),
      transcribe: (input) =>
        toResult(decodeTranscribe(input).pipe(Effect.flatMap((payload) => client.voice.transcribe({ payload })))),
      watchAnswer: (id, conversationId, after) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* chatParams(id, conversationId)
            return yield* client.chat.live({ params, query: { after: yield* decodeVersion(after) } })
          })
        ),
      stopAnswer: (id, conversationId) =>
        toResult(
          chatParams(id, conversationId).pipe(
            Effect.flatMap((params) => client.chat.stop({ params })),
            Effect.asVoid
          )
        ),
      answerAgain: (id, conversationId) =>
        toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.chat.regenerate({ params })))),
      editQuestion: (id, conversationId, text) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* chatParams(id, conversationId)
            return yield* client.chat.edit({ params, payload: yield* decodeEditQuestion({ text }) })
          })
        ),
      giveFeedback: (id, conversationId, messageId, input) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* chatParams(id, conversationId)
            return yield* client.coaching.giveFeedback({
              params: { ...params, messageId: yield* decodeMessageId(messageId) },
              payload: yield* decodeFeedback(input)
            })
          })
        ),
      listFeedback: (id, conversationId) =>
        toResult(chatParams(id, conversationId).pipe(Effect.flatMap((params) => client.coaching.feedback({ params })))),
      listRules: (id) => toResult(decodeId(id).pipe(Effect.flatMap((id) => client.coaching.rules({ params: { id } })))),
      addRule: (id, input) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeId(id) }
            return yield* client.coaching.addRule({ params, payload: yield* decodeNewRule(input) })
          })
        ),
      draftRule: (id, input) =>
        toResult(
          Effect.gen(function* () {
            const params = { id: yield* decodeId(id) }
            return yield* client.coaching.draftRule({ params, payload: yield* decodeDraftRule(input) })
          })
        ),
      changeRule: (id, ruleId, patch) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* ruleParams(id, ruleId)
            return yield* client.coaching.changeRule({ params, payload: yield* decodeRulePatch(patch) })
          })
        ),
      decideRule: (id, ruleId, accept) =>
        toResult(
          Effect.gen(function* () {
            const params = yield* ruleParams(id, ruleId)
            return yield* client.coaching.decideRule({ params, payload: yield* decodeRuleDecision({ accept }) })
          })
        ),
      removeRule: (id, ruleId) =>
        toResult(
          ruleParams(id, ruleId).pipe(
            Effect.flatMap((params) => client.coaching.removeRule({ params })),
            Effect.asVoid
          )
        ),
      listActivity: (query) =>
        toResult(decodeActivityQuery(query).pipe(Effect.flatMap((query) => client.activity.list({ query })))),
      listActionSteps: (id) =>
        toResult(decodeText(id).pipe(Effect.flatMap((id) => client.activity.steps({ params: { id } })))),
      listAppointmentReminders: (id) =>
        toResult(decodeAppointmentId(id).pipe(Effect.flatMap((id) => client.calendar.reminders({ params: { id } }))))
    } satisfies ApiConnection
  })
