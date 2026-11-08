import { assert, layer } from "@effect/vitest"
import { AgentChat, Agents, ChatModel, ModelProviders } from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Store } from "@scope-bot/db"
import { AgentId, ConversationId, ModelNotConfigured } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { AgentsApiHandlers, ChatApiHandlers, ModelsApiHandlers, SearchApiHandlers } from "../src/Http.ts"
import { TestAuthorization } from "./support.ts"

const model = Layer.succeed(
  ChatModel,
  ChatModel.of({
    models: Effect.succeed({
      defaultModel: "some-model",
      models: [{ id: "some-model", name: "Some model", group: "", free: false, efforts: [] }]
    }),
    reply: (request) =>
      request.turns.at(-1)?.text === "no key"
        ? Effect.fail(new ModelNotConfigured())
        : Effect.succeed({ text: "Hello!", model: request.model, inputTokens: 1, outputTokens: 1 })
  })
)

const services = AgentChat.layer.pipe(
  Layer.provideMerge(Agents.layer),
  Layer.provideMerge(ModelProviders.layerApiOnly),
  Layer.provide(model),
  Layer.provide(Store.layerMemory)
)

const handlers = Layer.mergeAll(AgentsApiHandlers, ChatApiHandlers, ModelsApiHandlers, SearchApiHandlers).pipe(
  Layer.provide(TestAuthorization),
  Layer.provide(services)
)

const chatOf = (agent: { readonly id: AgentId }) => ({ id: agent.id, conversationId: ConversationId.make(agent.id) })

const makeClient = HttpApiTest.groups(Api, ["agents", "chat", "models", "search"])

layer(Layer.mergeAll(handlers, TestAuthorization, HttpServer.layerServices))("Agents and chat API", (it) => {
  it.effect("creates an agent, changes its settings and chats with it", () =>
    Effect.gen(function* () {
      const client = yield* makeClient

      const agent = yield* client.agents.create({
        payload: { name: "Nino", job: "Front desk", color: "#000" }
      })
      assert.strictEqual(agent.model, "")
      assert.isTrue(agent.active)

      const updated = yield* client.agents.update({
        params: { id: agent.id },
        payload: { ...agent, instructions: "Open at 9:00", model: "claude-sonnet-5-5" }
      })
      assert.strictEqual(updated.instructions, "Open at 9:00")

      const sent = yield* client.chat.send({ params: chatOf(agent), payload: { text: "Hi" } })
      assert.strictEqual(sent.reply?.role, "agent")

      const messages = yield* client.chat.messages({ params: chatOf(agent) })
      assert.deepStrictEqual(
        messages.map((message) => message.text),
        ["Hi", "Hello!"]
      )

      const actions = yield* client.chat.actions({ params: { id: agent.id } })
      assert.strictEqual(actions[0]?.summary, "Replied to the customer")

      yield* client.agents.remove({ params: { id: agent.id } })
      assert.isFalse((yield* client.agents.list()).some((item) => item.id === agent.id))
    })
  )

  it.effect("pins an employee and finds what it said", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const agent = yield* client.agents.create({
        payload: { name: "Lasha", job: "Sales", color: "#000" }
      })
      assert.isFalse(agent.pinned)

      const pinned = yield* client.agents.pin({ params: { id: agent.id }, payload: { pinned: true } })
      assert.isTrue(pinned.pinned)

      const settings = yield* client.agents.update({ params: { id: agent.id }, payload: { ...pinned, tone: "brief" } })
      assert.isTrue(settings.pinned)

      yield* client.chat.send({ params: chatOf(agent), payload: { text: "Find the blue invoice" } })
      const last = yield* client.agents.lastMessages()
      assert.strictEqual(last.find((message) => message.agentId === agent.id)?.text, "Hello!")

      const hits = yield* client.search.run({ query: { q: "BLUE invoice" } })
      assert.isTrue(hits.some((hit) => hit.kind === "message" && hit.agentId === agent.id))
    })
  )

  it.effect("lists the provider's models", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const providers = yield* client.models.list()
      assert.strictEqual(providers[0]?.status, "connected")
      assert.strictEqual(providers[0]?.defaultModel, "some-model")
      assert.strictEqual(providers[0]?.models[0]?.name, "Some model")
    })
  )

  it.effect("returns typed errors", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const agent = yield* client.agents.create({
        payload: { name: "Tamar", job: "Sales", color: "#000" }
      })

      const notConfigured = yield* client.chat
        .send({
          params: chatOf(agent),
          payload: { text: "no key" }
        })
        .pipe(Effect.flip)
      assert.strictEqual(notConfigured._tag, "ModelNotConfigured")

      const notFound = yield* client.chat
        .messages({ params: chatOf({ id: AgentId.make("missing") }) })
        .pipe(Effect.flip)
      assert.strictEqual(notFound._tag, "AgentNotFound")
    })
  )
})
