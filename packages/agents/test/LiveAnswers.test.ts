import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, CurrentViewer, Store } from "@scope-bot/db"
import { ModelFailed, STOPPED, shownSoFar, UserId } from "@scope-bot/domain"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { AgentChat } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { CalendarTools } from "../src/CalendarTools.ts"
import { ChatModel, type ChatRequest } from "../src/ChatModel.ts"
import { ModelProviders } from "../src/ModelProviders.ts"

const owner = { userId: UserId.make("owner"), name: "Owner", seesShared: true }

/** A model that writes part of its reply, then waits for the test to say how it ends. */
const halfway = (started: Deferred.Deferred<void>, end: Deferred.Deferred<"finish" | "break">) =>
  Layer.succeed(
    ChatModel,
    ChatModel.of({
      models: Effect.succeed({ defaultModel: "", models: [] }),
      reply: (request: ChatRequest) =>
        Effect.gen(function* () {
          yield* request.onText?.("Thursday has two free times [[WHY: you asked") ?? Effect.void
          yield* Deferred.succeed(started, undefined)
          const how = yield* Deferred.await(end)
          if (how === "break") return yield* new ModelFailed({ reason: "connection" })
          return {
            text: "Thursday has two free times. [[WHY: you asked]]",
            model: request.model,
            inputTokens: 1,
            outputTokens: 1
          }
        })
    })
  )

const layerWith = (model: Layer.Layer<ChatModel>) =>
  AgentChat.layer.pipe(
    Layer.provideMerge(CalendarTools.layerWithCalendar),
    Layer.provideMerge(Agents.layer),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provideMerge(model),
    Layer.provideMerge(CalendarStorage.layerMemory),
    Layer.provideMerge(Store.layerMemory)
  )

/** Asks in a new tab and leaves the model halfway through. */
const askHalfway = (started: Deferred.Deferred<void>) =>
  Effect.gen(function* () {
    const chat = yield* AgentChat
    const agent = yield* Agents.use((agents) => agents.create({ name: "Tako", job: "Team", color: "#000" }))
    const tab = yield* chat.createConversation(agent.id)
    const sending = yield* chat.send(agent.id, tab.id, "Free times on Thursday?").pipe(Effect.forkChild)
    yield* Deferred.await(started)
    return { chat, agent, tab, sending }
  })

const run = <A, E>(
  effect: Effect.Effect<A, E, AgentChat | Store | Agents>,
  end: Deferred.Deferred<"finish" | "break">,
  started: Deferred.Deferred<void>
) => effect.pipe(Effect.provideService(CurrentViewer, owner), Effect.provide(layerWith(halfway(started, end))))

describe("live answers", () => {
  it("shows what can be shown of a reply still being written", () => {
    assert.strictEqual(shownSoFar("Hello [[WHY: because]] there [[TOO"), "Hello  there")
    assert.strictEqual(shownSoFar("Free at 16:30 ["), "Free at 16:30")
    assert.strictEqual(shownSoFar('[[TOOL schedule {"day": "2026-11-12"}]]'), "")
  })

  it.effect("shows the answer as it is written, and nothing once it is saved", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const end = yield* Deferred.make<"finish" | "break">()
      yield* run(
        Effect.gen(function* () {
          const { chat, agent, tab, sending } = yield* askHalfway(started)
          const writing = yield* chat.live(agent.id, tab.id, 0)
          assert.strictEqual(writing.status, "answering")
          assert.strictEqual(writing.text, "Thursday has two free times")

          yield* Deferred.succeed(end, "finish")
          const sent = yield* Fiber.join(sending)
          assert.strictEqual(sent.outcome, "replied")
          assert.strictEqual(sent.reply?.text, "Thursday has two free times.")
          const after = yield* chat.live(agent.id, tab.id, 0)
          assert.deepInclude(after, { status: "idle", text: "" })
          assert.isAbove(after.version, writing.version)
        }),
        end,
        started
      )
    })
  )

  it.effect("stops when a person says so, saves nothing and keeps what came", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const end = yield* Deferred.make<"finish" | "break">()
      yield* run(
        Effect.gen(function* () {
          const { chat, agent, tab, sending } = yield* askHalfway(started)
          yield* chat.stop(agent.id, tab.id)
          const sent = yield* Fiber.join(sending)
          assert.strictEqual(sent.outcome, "stopped")
          assert.isNull(sent.reply)
          assert.deepStrictEqual(
            (yield* chat.messages(agent.id, tab.id)).map((message) => message.role),
            ["customer"]
          )
          assert.deepInclude(yield* chat.live(agent.id, tab.id, 0), {
            status: "stopped",
            text: "Thursday has two free times"
          })
          assert.strictEqual((yield* chat.actions(agent.id)).at(-1)?.summary, STOPPED)
        }),
        end,
        started
      )
    })
  )

  it.effect("keeps what came when the model breaks off", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const end = yield* Deferred.make<"finish" | "break">()
      yield* run(
        Effect.gen(function* () {
          const { chat, agent, tab, sending } = yield* askHalfway(started)
          yield* Deferred.succeed(end, "break")
          const failed = yield* Fiber.join(sending).pipe(Effect.flip)
          assert.strictEqual(failed._tag, "ModelFailed")
          assert.deepInclude(yield* chat.live(agent.id, tab.id, 0), {
            status: "broke",
            text: "Thursday has two free times"
          })
        }),
        end,
        started
      )
    })
  )

  it.effect("does not stream a chat with a client", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const end = yield* Deferred.make<"finish" | "break">()
      yield* Deferred.succeed(end, "finish")
      yield* run(
        Effect.gen(function* () {
          const chat = yield* AgentChat
          const agent = yield* Agents.use((agents) => agents.create({ name: "Nino", job: "Front", color: "#000" }))
          const store = yield* Store
          const conversation = {
            id: "wa-chat" as never,
            agentId: agent.id,
            title: "Anna",
            createdAt: new Date(0).toISOString(),
            channel: "whatsapp" as const,
            address: "995500000000@s.whatsapp.net"
          }
          yield* store.saveConversation(conversation)
          yield* chat.send(agent.id, conversation.id, "Hello", [], { externalId: "wa-1", replyAs: "sending" })
          // Nothing ever changed there, so the state is the first one.
          assert.deepInclude(yield* chat.live(agent.id, conversation.id, -1), { status: "idle", version: 0 })
        }),
        end,
        started
      )
    })
  )
})
