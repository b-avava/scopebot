import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, CurrentViewer, Store } from "@scope-bot/db"
import {
  type ChatMessage,
  ConversationId,
  MAX_ACTIVE_RULES,
  MessageId,
  UserId,
  versionsOf,
  visibleMessages
} from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { AgentChat } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { CalendarTools } from "../src/CalendarTools.ts"
import { ChatModel, type ChatRequest } from "../src/ChatModel.ts"
import { Coaching } from "../src/Coaching.ts"
import { ModelProviders } from "../src/ModelProviders.ts"

/** Each answer says which one it is, so versions can be told apart. */
const makeLayer = (requests: Array<ChatRequest>) =>
  Coaching.layer.pipe(
    Layer.provideMerge(AgentChat.layer),
    Layer.provideMerge(CalendarTools.layerWithCalendar),
    Layer.provideMerge(Agents.layer),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provideMerge(
      Layer.succeed(
        ChatModel,
        ChatModel.of({
          models: Effect.succeed({ defaultModel: "", models: [] }),
          reply: (request) => {
            requests.push(request)
            return Effect.succeed({
              text: `Answer ${requests.length}`,
              model: request.model,
              inputTokens: 1,
              outputTokens: 1
            })
          }
        })
      )
    ),
    Layer.provideMerge(CalendarStorage.layerMemory),
    Layer.provideMerge(Store.layerMemory)
  )

const owner = { userId: UserId.make("owner"), name: "Owner", seesShared: true }

const hire = Agents.use((agents) => agents.create({ name: "Nino", job: "Front desk", color: "#000" }))

const message = (id: string, role: ChatMessage["role"], replaces?: string): ChatMessage => ({
  id: MessageId.make(id),
  agentId: "a" as ChatMessage["agentId"],
  conversationId: ConversationId.make("c"),
  role,
  text: id,
  createdAt: "",
  ...(replaces === undefined ? {} : { replaces: MessageId.make(replaces) })
})

describe("versions of messages", () => {
  it("shows the latest version and hides the exchange of an older question", () => {
    const messages = [
      message("q1", "customer"),
      message("a1", "agent"),
      message("a1b", "agent", "a1"),
      message("q1b", "customer", "q1"),
      message("a2", "agent")
    ]
    assert.deepStrictEqual(
      visibleMessages(messages).map((item) => item.id),
      ["q1b", "a2"]
    )
    assert.deepStrictEqual(
      versionsOf(messages, message("a1b", "agent", "a1")).map((item) => item.id),
      ["a1", "a1b"]
    )
  })

  it("shows the version a person picked, with its own answers", () => {
    const messages = [
      message("q1", "customer"),
      message("a1", "agent"),
      message("a1b", "agent", "a1"),
      message("q1b", "customer", "q1"),
      message("a2", "agent")
    ]
    const picked = new Map([
      [MessageId.make("q1"), MessageId.make("q1")],
      [MessageId.make("a1"), MessageId.make("a1")]
    ])
    assert.deepStrictEqual(
      visibleMessages(messages, picked).map((item) => item.id),
      ["q1", "a1"]
    )
  })
})

describe("Coaching", () => {
  it.effect("answers again as a version, and the model never sees the older answer", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const chat = yield* AgentChat
      const agent = yield* hire
      const tab = yield* chat.createConversation(agent.id)

      yield* chat.send(agent.id, tab.id, "Prices?")
      const first = (yield* chat.messages(agent.id, tab.id)).at(-1)
      const again = yield* chat.regenerate(agent.id, tab.id)

      assert.strictEqual(again.reply?.text, "Answer 2")
      assert.strictEqual(again.reply?.replaces, first?.id)
      assert.strictEqual(again.customerMessage.text, "Prices?")
      assert.deepStrictEqual(
        requests[1]?.turns.map((turn) => turn.text),
        ["Prices?"],
        "The older answer stays out of the history"
      )
      const third = yield* chat.regenerate(agent.id, tab.id)
      assert.strictEqual(third.reply?.replaces, first?.id, "Every version names the first one")
      assert.strictEqual((yield* chat.messages(agent.id, tab.id)).length, 4, "Nothing is deleted")
    }).pipe(Effect.provideService(CurrentViewer, owner), Effect.provide(makeLayer(requests)))
  })

  it.effect("edits the last question and answers that instead", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const chat = yield* AgentChat
      const agent = yield* hire
      const tab = yield* chat.createConversation(agent.id)

      const asked = yield* chat.send(agent.id, tab.id, "Prices")
      yield* chat.send(agent.id, tab.id, "For kids?")
      const edited = yield* chat.edit(agent.id, tab.id, " For adults? ")

      assert.strictEqual(edited.customerMessage.text, "For adults?")
      assert.isDefined(edited.customerMessage.replaces)
      assert.deepStrictEqual(
        requests.at(-1)?.turns.map((turn) => turn.text),
        ["Prices", "Answer 1", "For adults?"]
      )
      assert.deepStrictEqual(
        visibleMessages(yield* chat.messages(agent.id, tab.id)).map((item) => item.text),
        ["Prices", "Answer 1", "For adults?", "Answer 3"]
      )
      assert.notStrictEqual(asked.customerMessage.id, edited.customerMessage.replaces)

      const shared = yield* chat.regenerate(agent.id, ConversationId.make(agent.id)).pipe(Effect.flip)
      assert.strictEqual(shared._tag, "CannotAnswerAgain", "An empty chat has nothing to answer again")
    }).pipe(Effect.provideService(CurrentViewer, owner), Effect.provide(makeLayer(requests)))
  })

  it.effect("keeps one feedback per person and answer", () =>
    Effect.gen(function* () {
      const chat = yield* AgentChat
      const coaching = yield* Coaching
      const agent = yield* hire
      const tab = yield* chat.createConversation(agent.id)
      const sent = yield* chat.send(agent.id, tab.id, "Prices?")
      const answer = sent.reply?.id ?? MessageId.make("none")

      yield* coaching.giveFeedback(agent.id, tab.id, answer, { rating: "good", reasons: [], note: "" })
      const bad = yield* coaching.giveFeedback(agent.id, tab.id, answer, {
        rating: "bad",
        reasons: ["too-long"],
        note: " Shorter please "
      })
      assert.strictEqual(bad.note, "Shorter please")
      assert.strictEqual(bad.userName, "Owner")
      const kept = yield* coaching.feedback(agent.id, tab.id)
      assert.deepStrictEqual(
        kept.map((item) => [item.rating, item.reasons]),
        [["bad", ["too-long"]]]
      )

      const onQuestion = yield* coaching
        .giveFeedback(agent.id, tab.id, sent.customerMessage.id, { rating: "good", reasons: [], note: "" })
        .pipe(Effect.flip)
      assert.strictEqual(onQuestion._tag, "ConversationNotFound", "Only answers get feedback")
    }).pipe(Effect.provideService(CurrentViewer, owner), Effect.provide(makeLayer([])))
  )

  it.effect("follows the team's active rules and never more than the limit", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const chat = yield* AgentChat
      const coaching = yield* Coaching
      const agent = yield* hire

      yield* coaching.addRule(agent.id, { text: "Name prices in GEL" }, true)
      const waiting = yield* coaching.addRule(agent.id, { text: "Say hi in Georgian" }, false)
      const off = yield* coaching.addRule(agent.id, { text: "Never mention discounts" }, true)
      yield* coaching.changeRule(agent.id, off.id, { enabled: false })
      yield* chat.send(agent.id, ConversationId.make(agent.id), "Prices?")

      const system = requests[0]?.system ?? ""
      assert.include(system, "Rules from your team")
      assert.include(system, "- Name prices in GEL")
      assert.notInclude(system, "Say hi in Georgian", "A suggestion waits for an owner or admin")
      assert.notInclude(system, "Never mention discounts", "A rule turned off is left out")

      const declined = yield* coaching.decideRule(agent.id, waiting.id, { accept: false })
      assert.strictEqual(declined.status, "declined")

      for (let index = 1; index < MAX_ACTIVE_RULES; index++) {
        yield* coaching.addRule(agent.id, { text: `Rule ${index}` }, true)
      }
      const tooMany = yield* coaching.addRule(agent.id, { text: "One more" }, true).pipe(Effect.flip)
      assert.strictEqual(tooMany._tag, "TooManyRules")
      const backOn = yield* coaching.changeRule(agent.id, off.id, { enabled: true }).pipe(Effect.flip)
      assert.strictEqual(backOn._tag, "TooManyRules", "Turning one back on counts too")
      const suggestion = yield* coaching.addRule(agent.id, { text: "Still welcome" }, false)
      assert.strictEqual(suggestion.status, "suggested", "Members can still suggest at the limit")
    }).pipe(Effect.provideService(CurrentViewer, owner), Effect.provide(makeLayer(requests)))
  })

  it.effect("drafts a rule from a note on an answer", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const chat = yield* AgentChat
      const agent = yield* hire
      const sent = yield* chat.send(agent.id, ConversationId.make(agent.id), "Prices?")

      const drafted = yield* chat.draftRule(agent.id, "Too long, keep it short", sent.reply?.id)
      assert.strictEqual(drafted.text, "Answer 2")
      assert.include(requests[1]?.turns[0]?.text ?? "", "Answer 1")
      assert.include(requests[1]?.turns[0]?.text ?? "", "Too long, keep it short")
      assert.strictEqual((yield* chat.actions(agent.id)).at(-1)?.tool, "rule-draft")
      assert.lengthOf(yield* chat.messages(agent.id, ConversationId.make(agent.id)), 2, "The note is not kept")
    }).pipe(Effect.provideService(CurrentViewer, owner), Effect.provide(makeLayer(requests)))
  })
})
