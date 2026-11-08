import { Api } from "@scope-bot/contracts"
import {
  ActivityId,
  ActivityPatch,
  AgentId,
  AgentSettings,
  ApprovalDecision,
  ApprovalId,
  type AuthSession,
  BusinessProfile,
  ChangePassword,
  ChannelSettings,
  ConnectTelegram,
  ContactDetails,
  ContactId,
  ConversationId,
  CreateAgent,
  DealDetails,
  DealId,
  DepartmentDetails,
  DepartmentId,
  type InstagramLogin,
  JoinTeam,
  LinkWhatsApp,
  Login,
  MessageId,
  NewActivity,
  NewInvite,
  PinAgent,
  PipelineDetails,
  PipelineId,
  ProviderId,
  ProviderKey,
  ProviderPreferences,
  Register,
  RenameConversation,
  SendDraft,
  SendMessage,
  SendWhatsApp,
  ServiceDetails,
  ServiceId,
  ServicePreview,
  SideQuestion,
  UserId,
  WhatsAppSettings
} from "@scope-bot/domain"
import { Config, Context, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import type { BridgeError, BridgeResult, ScopeBotBridge, ServerStatus } from "../preload/bridge.ts"
import { SessionToken } from "./SessionToken.ts"

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
  Forbidden: "forbidden",
  InviteInvalid: "invite-invalid",
  DraftNotFound: "gone",
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
  InstagramSendFailed: "instagram-send-failed"
}

const toResult = <A, E extends { readonly _tag: string }>(
  effect: Effect.Effect<A, E>
): Effect.Effect<BridgeResult<A>> =>
  effect.pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error) => Effect.succeed({ ok: false as const, error: errorCodes[error._tag] ?? "offline" }))
  )

// Everything below comes from the renderer, so it is validated before use.
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

export class ServerConnection extends Context.Service<
  ServerConnection,
  {
    readonly status: Effect.Effect<ServerStatus>
    readonly getAccount: Bridged<"getAccount">
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
  }
>()("@scope-bot/desktop/main/ServerConnection") {
  static readonly layerNoDeps = Layer.effect(
    ServerConnection,
    Effect.gen(function* () {
      const url = yield* Config.String("SCOPE_BOT_SERVER_URL").pipe(Config.withDefault("http://127.0.0.1:3000"))
      const token = yield* SessionToken
      const client = yield* HttpApiClient.make(Api, {
        transformClient: (http) =>
          http.pipe(
            HttpClient.mapRequest(HttpClientRequest.prependUrl(url)),
            HttpClient.mapRequestEffect((request) =>
              token.get.pipe(
                Effect.map((current) => (current === null ? request : HttpClientRequest.bearerToken(request, current)))
              )
            )
          )
      })

      /** Keeps the token here and tells the page only who signed in. */
      const keepSession = <E>(session: Effect.Effect<AuthSession, E>) =>
        session.pipe(
          Effect.tap(({ token: value }) => token.set(value)),
          Effect.map(({ account }) => account)
        )

      const status = client.system.health().pipe(
        Effect.timeout("2 seconds"),
        Effect.as<ServerStatus>({ state: "online", url }),
        Effect.catch(() => Effect.succeed<ServerStatus>({ state: "offline", url }))
      )

      return ServerConnection.of({
        status,
        getAccount: token.get.pipe(
          Effect.flatMap((current) =>
            current === null
              ? Effect.succeed({ ok: true as const, value: null })
              : toResult(
                  client.account.me().pipe(Effect.catchTag("Unauthorized", () => token.set(null).pipe(Effect.as(null))))
                )
          )
        ),
        register: (input) =>
          toResult(
            decodeRegister(input).pipe(Effect.flatMap((payload) => keepSession(client.auth.register({ payload }))))
          ),
        login: (input) =>
          toResult(decodeLogin(input).pipe(Effect.flatMap((payload) => keepSession(client.auth.login({ payload }))))),
        joinTeam: (input) =>
          toResult(decodeJoin(input).pipe(Effect.flatMap((payload) => keepSession(client.auth.join({ payload }))))),
        // Signing out works here even when the server cannot be reached.
        logout: client.account
          .logout()
          .pipe(Effect.ignore, Effect.andThen(token.set(null)), Effect.as({ ok: true as const, value: undefined })),
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
          toResult(
            decodePreview(input).pipe(Effect.flatMap((payload) => client.assistant.previewService({ payload })))
          ),
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
        search: (query) =>
          toResult(decodeQuery(query).pipe(Effect.flatMap((q) => client.search.run({ query: { q } })))),
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
        listActions: (id) =>
          toResult(decodeId(id).pipe(Effect.flatMap((id) => client.chat.actions({ params: { id } })))),
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
            decodeWhatsAppSettings(settings).pipe(
              Effect.flatMap((payload) => client.whatsapp.saveSettings({ payload }))
            )
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
          toResult(
            decodeConversation(chatId).pipe(Effect.flatMap((id) => client.whatsapp.messages({ params: { id } })))
          ),
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
          toResult(
            decodeConversation(chatId).pipe(Effect.flatMap((id) => client.telegram.messages({ params: { id } })))
          ),
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
            decodeChannelSettings(settings).pipe(
              Effect.flatMap((payload) => client.instagram.saveSettings({ payload }))
            )
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
          )
      })
    })
  )

  static readonly layer = ServerConnection.layerNoDeps.pipe(Layer.provide(FetchHttpClient.layer))
}
