import {
  Agent,
  AgentAction,
  AgentId,
  AgentNotFound,
  AgentPaused,
  AgentSettings,
  BusinessProfile,
  ChatMessage,
  ChatState,
  Conversation,
  ConversationId,
  ConversationNotFound,
  ConversationRequired,
  ConversationSummary,
  CreateAgent,
  HealthStatus,
  LastMessage,
  ModelFailed,
  ModelNotConfigured,
  ModelRefused,
  PinAgent,
  ProviderCatalog,
  ProviderId,
  ProviderKey,
  ProviderLoginFailed,
  ProviderPreferences,
  RenameConversation,
  SearchHit,
  SendMessage,
  SentMessage,
  SideAnswer,
  SideQuestion
} from "@scope-bot/domain"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", {
    success: HealthStatus
  })
) {}

export class BusinessApi extends HttpApiGroup.make("business")
  .add(
    HttpApiEndpoint.get("get", "/", {
      success: BusinessProfile
    }),
    HttpApiEndpoint.put("save", "/", {
      payload: BusinessProfile,
      success: BusinessProfile
    })
  )
  .prefix("/business") {}

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
      error: AgentNotFound
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
  .prefix("/agents") {}

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
  .prefix("/agents") {}

export class SearchApi extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.get("run", "/", {
      query: { q: Schema.String },
      success: Schema.Array(SearchHit)
    })
  )
  .prefix("/search") {}

export class ModelsApi extends HttpApiGroup.make("models")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(ProviderCatalog)
    })
  )
  .prefix("/models") {}

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
      payload: ProviderKey
    }),
    HttpApiEndpoint.delete("removeKey", "/:id/key", {
      params: { id: ProviderId }
    }),
    HttpApiEndpoint.post("login", "/:id/login", {
      params: { id: ProviderId },
      error: ProviderLoginFailed
    })
  )
  .prefix("/providers") {}

export class Api extends HttpApi.make("scope-bot")
  .add(SystemApi)
  .add(BusinessApi)
  .add(AgentsApi)
  .add(ChatApi)
  .add(SearchApi)
  .add(ModelsApi)
  .add(ProvidersApi)
  .annotateMerge(OpenApi.annotations({ title: "Scope Bot API" })) {}
