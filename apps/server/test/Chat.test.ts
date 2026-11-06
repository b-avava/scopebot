import { assert, layer } from "@effect/vitest"
import { AgentChat, Agents, ChatModel } from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Store } from "@scope-bot/db"
import { AgentId, ModelNotConfigured } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { AgentsApiHandlers, ChatApiHandlers, ModelsApiHandlers } from "../src/Http.ts"

const model = Layer.succeed(
  ChatModel,
  ChatModel.of({
    models: Effect.succeed({
      defaultModel: "some-model",
      models: [{ id: "some-model", name: "Some model", group: "", free: false }]
    }),
    reply: (request) =>
      request.turns.at(-1)?.text === "no key"
        ? Effect.fail(new ModelNotConfigured())
        : Effect.succeed({ text: "Hello!", model: request.model, inputTokens: 1, outputTokens: 1 })
  })
)

const services = AgentChat.layer.pipe(
  Layer.provideMerge(Agents.layer),
  Layer.provide(model),
  Layer.provide(Store.layerMemory)
)

const handlers = Layer.mergeAll(AgentsApiHandlers, ChatApiHandlers, ModelsApiHandlers).pipe(Layer.provide(services))

const makeClient = HttpApiTest.groups(Api, ["agents", "chat", "models"])

layer(Layer.mergeAll(handlers, HttpServer.layerServices))("Agents and chat API", (it) => {
  it.effect("creates an agent, changes its settings and chats with it", () =>
    Effect.gen(function* () {
      const client = yield* makeClient

      const agent = yield* client.agents.create({
        payload: { name: "Nino", job: "Front desk", color: "#000", shape: "squircle", face: "neutral" }
      })
      assert.strictEqual(agent.model, "")
      assert.isTrue(agent.active)

      const updated = yield* client.agents.update({
        params: { id: agent.id },
        payload: { ...agent, instructions: "Open at 9:00", model: "claude-sonnet-5-5" }
      })
      assert.strictEqual(updated.instructions, "Open at 9:00")

      const sent = yield* client.chat.send({ params: { id: agent.id }, payload: { text: "Hi" } })
      assert.strictEqual(sent.reply?.role, "agent")

      const messages = yield* client.chat.messages({ params: { id: agent.id } })
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

  it.effect("lists the provider's models", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const catalog = yield* client.models.list()
      assert.strictEqual(catalog.defaultModel, "some-model")
      assert.strictEqual(catalog.models[0]?.name, "Some model")
    })
  )

  it.effect("returns typed errors", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const agent = yield* client.agents.create({
        payload: { name: "Tamar", job: "Sales", color: "#000", shape: "circle", face: "happy" }
      })

      const notConfigured = yield* client.chat
        .send({
          params: { id: agent.id },
          payload: { text: "no key" }
        })
        .pipe(Effect.flip)
      assert.strictEqual(notConfigured._tag, "ModelNotConfigured")

      const notFound = yield* client.chat.messages({ params: { id: AgentId.make("missing") } }).pipe(Effect.flip)
      assert.strictEqual(notFound._tag, "AgentNotFound")
    })
  )
})
