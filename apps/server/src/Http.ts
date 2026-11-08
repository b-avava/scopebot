import {
  Activities,
  AgentChat,
  Agents,
  Approvals,
  Contacts,
  Deals,
  Departments,
  Instagram,
  ModelProviders,
  Services,
  Telegram,
  WhatsApp
} from "@scope-bot/agents"
import { Api, CurrentSession } from "@scope-bot/contracts"
import { Forbidden } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Auth } from "./Auth.ts"

/** Settings of the whole business are for owners and admins. */
const requireManager = CurrentSession.pipe(
  Effect.flatMap(({ account }) => (account.user.role === "member" ? Effect.fail(new Forbidden()) : Effect.void))
)

export const SystemApiHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function* (handlers) {
    return handlers.handleAll({
      health: () => Effect.succeed({ status: "ok" as const })
    })
  })
)

export const AuthApiHandlers = HttpApiBuilder.group(
  Api,
  "auth",
  Effect.fn(function* (handlers) {
    const auth = yield* Auth

    return handlers.handleAll({
      register: ({ payload }) => auth.register(payload),
      login: ({ payload }) => auth.login(payload),
      join: ({ payload }) => auth.join(payload)
    })
  })
)

export const AccountApiHandlers = HttpApiBuilder.group(
  Api,
  "account",
  Effect.fn(function* (handlers) {
    const auth = yield* Auth

    return handlers.handleAll({
      me: () => CurrentSession.pipe(Effect.map(({ account }) => account)),
      logout: () => CurrentSession.pipe(Effect.flatMap(auth.logout)),
      changePassword: ({ payload }) =>
        CurrentSession.pipe(Effect.flatMap((session) => auth.changePassword(session, payload)))
    })
  })
)

export const TeamApiHandlers = HttpApiBuilder.group(
  Api,
  "team",
  Effect.fn(function* (handlers) {
    const auth = yield* Auth

    return handlers.handleAll({
      list: () => CurrentSession.pipe(Effect.flatMap(auth.team)),
      invite: ({ payload }) => CurrentSession.pipe(Effect.flatMap((session) => auth.invite(session, payload))),
      remove: ({ params }) => CurrentSession.pipe(Effect.flatMap((session) => auth.removeMember(session, params.id)))
    })
  })
)

export const BusinessApiHandlers = HttpApiBuilder.group(
  Api,
  "business",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents

    return handlers.handleAll({
      get: () => agents.business,
      save: ({ payload }) => requireManager.pipe(Effect.andThen(agents.saveBusiness(payload)))
    })
  })
)

export const AgentsApiHandlers = HttpApiBuilder.group(
  Api,
  "agents",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents

    return handlers.handleAll({
      list: () => agents.list,
      statuses: () => agents.statuses,
      lastMessages: () => agents.lastMessages,
      create: ({ payload }) => agents.create(payload),
      update: ({ params, payload }) => agents.update(params.id, payload),
      pin: ({ params, payload }) => agents.pin(params.id, payload.pinned),
      remove: ({ params }) => agents.remove(params.id)
    })
  })
)

export const ContactsApiHandlers = HttpApiBuilder.group(
  Api,
  "contacts",
  Effect.fn(function* (handlers) {
    const contacts = yield* Contacts

    return handlers.handleAll({
      list: () => contacts.list,
      create: ({ payload }) => contacts.create(payload),
      update: ({ params, payload }) => contacts.update(params.id, payload),
      remove: ({ params }) => contacts.remove(params.id)
    })
  })
)

export const DepartmentsApiHandlers = HttpApiBuilder.group(
  Api,
  "departments",
  Effect.fn(function* (handlers) {
    const departments = yield* Departments

    return handlers.handleAll({
      list: () => departments.list,
      create: ({ payload }) => departments.create(payload),
      update: ({ params, payload }) => departments.update(params.id, payload),
      remove: ({ params }) => departments.remove(params.id)
    })
  })
)

export const PipelinesApiHandlers = HttpApiBuilder.group(
  Api,
  "pipelines",
  Effect.fn(function* (handlers) {
    const deals = yield* Deals

    return handlers.handleAll({
      list: () => deals.pipelines,
      update: ({ params, payload }) => deals.updatePipeline(params.id, payload)
    })
  })
)

export const DealsApiHandlers = HttpApiBuilder.group(
  Api,
  "deals",
  Effect.fn(function* (handlers) {
    const deals = yield* Deals

    return handlers.handleAll({
      list: () => deals.list,
      create: ({ payload }) => deals.create(payload),
      update: ({ params, payload }) => deals.update(params.id, payload),
      remove: ({ params }) => deals.remove(params.id)
    })
  })
)

export const ServicesApiHandlers = HttpApiBuilder.group(
  Api,
  "services",
  Effect.fn(function* (handlers) {
    const services = yield* Services

    return handlers.handleAll({
      list: () => services.list,
      create: ({ payload }) => services.create(payload),
      update: ({ params, payload }) => services.update(params.id, payload),
      remove: ({ params }) => services.remove(params.id)
    })
  })
)

export const ActivitiesApiHandlers = HttpApiBuilder.group(
  Api,
  "activities",
  Effect.fn(function* (handlers) {
    const activities = yield* Activities

    return handlers.handleAll({
      list: () => activities.list,
      create: ({ payload }) => activities.create(payload),
      update: ({ params, payload }) => activities.update(params.id, payload),
      remove: ({ params }) => activities.remove(params.id)
    })
  })
)

export const ApprovalsApiHandlers = HttpApiBuilder.group(
  Api,
  "approvals",
  Effect.fn(function* (handlers) {
    const approvals = yield* Approvals

    return handlers.handleAll({
      list: () => approvals.list,
      create: ({ payload }) => approvals.create(payload),
      decide: ({ params, payload }) => approvals.decide(params.id, payload)
    })
  })
)

export const AssistantApiHandlers = HttpApiBuilder.group(
  Api,
  "assistant",
  Effect.fn(function* (handlers) {
    const chat = yield* AgentChat

    return handlers.handleAll({
      previewService: ({ payload }) => chat.preview(payload.agentId, payload.text),
      summarizeContact: ({ params }) => chat.summarize(params.id)
    })
  })
)

export const ChatApiHandlers = HttpApiBuilder.group(
  Api,
  "chat",
  Effect.fn(function* (handlers) {
    const chat = yield* AgentChat

    return handlers.handleAll({
      conversations: ({ params }) => chat.conversations(params.id),
      createConversation: ({ params }) => chat.createConversation(params.id),
      renameConversation: ({ params, payload }) =>
        chat.renameConversation(params.id, params.conversationId, payload.title),
      removeConversation: ({ params }) => chat.removeConversation(params.id, params.conversationId),
      messages: ({ params }) => chat.messages(params.id, params.conversationId),
      send: ({ params, payload }) => chat.send(params.id, params.conversationId, payload.text, payload.images),
      ask: ({ params, payload }) => chat.ask(params.id, params.conversationId, payload.text),
      actions: ({ params }) => chat.actions(params.id),
      state: ({ params }) => chat.state(params.id, params.conversationId),
      resume: ({ params }) => chat.resume(params.id, params.conversationId)
    })
  })
)

export const SearchApiHandlers = HttpApiBuilder.group(
  Api,
  "search",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents

    return handlers.handleAll({
      run: ({ query }) => agents.search(query.q)
    })
  })
)

export const ModelsApiHandlers = HttpApiBuilder.group(
  Api,
  "models",
  Effect.fn(function* (handlers) {
    const providers = yield* ModelProviders

    return handlers.handleAll({
      list: () => providers.list
    })
  })
)

export const ProvidersApiHandlers = HttpApiBuilder.group(
  Api,
  "providers",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents
    const providers = yield* ModelProviders

    return handlers.handleAll({
      preferences: () => agents.preferences,
      savePreferences: ({ payload }) => agents.savePreferences(payload),
      saveKey: ({ params, payload }) => requireManager.pipe(Effect.andThen(providers.saveKey(params.id, payload))),
      removeKey: ({ params }) => requireManager.pipe(Effect.andThen(providers.removeKey(params.id))),
      login: ({ params }) => providers.login(params.id)
    })
  })
)

export const WhatsAppApiHandlers = HttpApiBuilder.group(
  Api,
  "whatsapp",
  Effect.fn(function* (handlers) {
    const whatsapp = yield* WhatsApp

    return handlers.handleAll({
      status: () => whatsapp.status,
      saveSettings: ({ payload }) => requireManager.pipe(Effect.andThen(whatsapp.saveSettings(payload))),
      link: ({ payload }) => requireManager.pipe(Effect.andThen(whatsapp.link(payload))),
      cancelLink: () => requireManager.pipe(Effect.andThen(whatsapp.cancelLink)),
      unlink: () => requireManager.pipe(Effect.andThen(whatsapp.unlink)),
      chats: () => whatsapp.chats,
      messages: ({ params }) => whatsapp.messages(params.id),
      send: ({ params, payload }) => whatsapp.send(params.id, payload.text),
      sendDraft: ({ params, payload }) => whatsapp.sendDraft(params.id, payload.text),
      discardDraft: ({ params }) => whatsapp.discardDraft(params.id),
      resume: ({ params }) => whatsapp.resume(params.id)
    })
  })
)

export const TelegramApiHandlers = HttpApiBuilder.group(
  Api,
  "telegram",
  Effect.fn(function* (handlers) {
    const telegram = yield* Telegram

    return handlers.handleAll({
      status: () => telegram.status,
      saveSettings: ({ payload }) => requireManager.pipe(Effect.andThen(telegram.saveSettings(payload))),
      connect: ({ payload }) => requireManager.pipe(Effect.andThen(telegram.connect(payload))),
      disconnect: () => requireManager.pipe(Effect.andThen(telegram.disconnect)),
      chats: () => telegram.chats,
      messages: ({ params }) => telegram.messages(params.id),
      send: ({ params, payload }) => telegram.send(params.id, payload.text),
      sendDraft: ({ params, payload }) => telegram.sendDraft(params.id, payload.text),
      discardDraft: ({ params }) => telegram.discardDraft(params.id),
      resume: ({ params }) => telegram.resume(params.id)
    })
  })
)

export const InstagramApiHandlers = HttpApiBuilder.group(
  Api,
  "instagram",
  Effect.fn(function* (handlers) {
    const instagram = yield* Instagram

    return handlers.handleAll({
      status: () => instagram.status,
      saveSettings: ({ payload }) => requireManager.pipe(Effect.andThen(instagram.saveSettings(payload))),
      login: () => requireManager.pipe(Effect.andThen(instagram.login)),
      checkReachable: () => instagram.checkReachable,
      disconnect: () => requireManager.pipe(Effect.andThen(instagram.disconnect)),
      chats: () => instagram.chats,
      messages: ({ params }) => instagram.messages(params.id),
      send: ({ params, payload }) => instagram.send(params.id, payload.text),
      sendDraft: ({ params, payload }) => instagram.sendDraft(params.id, payload.text),
      discardDraft: ({ params }) => instagram.discardDraft(params.id),
      resume: ({ params }) => instagram.resume(params.id)
    })
  })
)

export const ApiHandlers = Layer.mergeAll(
  SystemApiHandlers,
  AuthApiHandlers,
  AccountApiHandlers,
  TeamApiHandlers,
  BusinessApiHandlers,
  AgentsApiHandlers,
  ContactsApiHandlers,
  DepartmentsApiHandlers,
  PipelinesApiHandlers,
  DealsApiHandlers,
  ServicesApiHandlers,
  ActivitiesApiHandlers,
  ApprovalsApiHandlers,
  AssistantApiHandlers,
  ChatApiHandlers,
  SearchApiHandlers,
  ModelsApiHandlers,
  ProvidersApiHandlers,
  WhatsAppApiHandlers,
  TelegramApiHandlers,
  InstagramApiHandlers
)

export const ApiRoutes = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json"
}).pipe(Layer.provide(ApiHandlers))
