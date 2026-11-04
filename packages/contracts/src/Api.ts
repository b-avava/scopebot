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
  CreateAgent,
  HealthStatus,
  ModelFailed,
  ModelNotConfigured,
  ModelRefused,
  SendMessage,
  SentMessage
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
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: AgentId },
      error: AgentNotFound
    })
  )
  .prefix("/agents") {}

export class ChatApi extends HttpApiGroup.make("chat")
  .add(
    HttpApiEndpoint.get("messages", "/:id/messages", {
      params: { id: AgentId },
      success: Schema.Array(ChatMessage),
      error: AgentNotFound
    }),
    HttpApiEndpoint.post("send", "/:id/messages", {
      params: { id: AgentId },
      payload: SendMessage,
      success: SentMessage,
      error: [AgentNotFound, AgentPaused, ModelNotConfigured, ModelFailed, ModelRefused]
    }),
    HttpApiEndpoint.get("actions", "/:id/actions", {
      params: { id: AgentId },
      success: Schema.Array(AgentAction),
      error: AgentNotFound
    }),
    HttpApiEndpoint.get("state", "/:id/state", {
      params: { id: AgentId },
      success: ChatState,
      error: AgentNotFound
    }),
    HttpApiEndpoint.post("resume", "/:id/resume", {
      params: { id: AgentId },
      success: ChatState,
      error: AgentNotFound
    })
  )
  .prefix("/agents") {}

export class Api extends HttpApi.make("scope-bot")
  .add(SystemApi)
  .add(BusinessApi)
  .add(AgentsApi)
  .add(ChatApi)
  .annotateMerge(OpenApi.annotations({ title: "Scope Bot API" })) {}
