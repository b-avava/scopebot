import { assert, describe, it } from "@effect/vitest"
import { CurrentBusiness, Store, TelegramStorage } from "@scope-bot/db"
import { BusinessId, type ConversationId } from "@scope-bot/domain"
import { makeFakeTelegram } from "@scope-bot/integrations/testing"
import { Effect, Layer } from "effect"
import { AgentChat } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { ChatModel } from "../src/ChatModel.ts"
import { Contacts } from "../src/Contacts.ts"
import { ModelProviders } from "../src/ModelProviders.ts"
import { Telegram } from "../src/Telegram.ts"

const setup = () => {
  const telegram = makeFakeTelegram()
  const model = Layer.succeed(
    ChatModel,
    ChatModel.of({
      models: Effect.succeed({ defaultModel: "", models: [] }),
      reply: (request) =>
        Effect.succeed({
          // Asked about the company, the employee does not know and asks for a colleague.
          text: request.turns.at(-1)?.text.includes("company")
            ? "Let me ask a colleague. [[HANDOFF: No description of the company]]"
            : "Hello from Nino",
          model: request.model,
          inputTokens: 1,
          outputTokens: 1
        })
    })
  )
  const layer = Telegram.layer.pipe(
    Layer.provideMerge(AgentChat.layer),
    Layer.provideMerge(Agents.layer),
    Layer.provideMerge(Contacts.layer),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provide(model),
    Layer.provideMerge(Store.layerMemory),
    Layer.provideMerge(TelegramStorage.layerMemory),
    Layer.provide(telegram.layer)
  )
  const run = <A, E>(effect: Effect.Effect<A, E, Telegram | AgentChat | Agents | Contacts | Store | TelegramStorage>) =>
    effect.pipe(Effect.provide(layer), Effect.provideService(CurrentBusiness, BusinessId.make("northwind")))
  return { telegram, run }
}

const eventually = <A, E, R>(effect: Effect.Effect<A, E, R>, done: (value: A) => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 300; attempt++) {
      const value = yield* effect
      if (done(value)) return value
      yield* Effect.sleep(10)
    }
    return yield* Effect.die("It never happened")
  })

const present = <A>(item: A | undefined): A => {
  if (item === undefined) throw new Error("Expected an item")
  return item
}

const hire = Agents.use((agents) => agents.create({ name: "Nino", job: "Sales", color: "#3B8BEB" }))

const connectBot = (token: string, alone = false) =>
  Effect.gen(function* () {
    const telegram = yield* Telegram
    const agent = yield* hire
    yield* telegram.saveSettings({ agentId: agent.id, audience: "everyone", answersAlone: alone })
    yield* telegram.connect({ token })
    yield* eventually(telegram.status, (status) => status.online)
    return agent
  })

describe("Telegram", () => {
  it.live("needs an employee and a real token, then shows the bot and listens", () => {
    const { telegram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const telegram = yield* Telegram
        const refused = yield* telegram.connect({ token: fake.validToken }).pipe(Effect.flip)
        assert.strictEqual(refused._tag, "TelegramNeedsAgent")

        const agent = yield* hire
        yield* telegram.saveSettings({ agentId: agent.id, audience: "everyone", answersAlone: false })
        const wrong = yield* telegram.connect({ token: "999999:wrongwrongwrongwrongwrongwrongwrong" }).pipe(Effect.flip)
        assert.strictEqual(wrong._tag, "TelegramTokenInvalid")
        assert.isNull((yield* telegram.status).bot)

        const connected = yield* telegram.connect({ token: fake.validToken })
        assert.deepStrictEqual(connected.bot, { username: "northwind_bot", name: "Northwind" })
        assert.isNotNull(connected.connectedAt)
        assert.isTrue((yield* eventually(telegram.status, (status) => status.online)).online)
      })
    )
  })

  it.live("turns a sender into a contact, drafts a reply and sends it to the bot chat", () => {
    const { telegram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const telegram = yield* Telegram
        const agent = yield* connectBot(fake.validToken)
        fake.receive({ text: "Can you start in December?" })

        const chat = present((yield* eventually(telegram.chats, (list) => list.length === 1))[0])
        assert.strictEqual(chat.name, "Anna Kiknadze")
        assert.strictEqual(chat.username, "@anna_k")
        assert.strictEqual(chat.via, "bot")
        const messages = yield* eventually(telegram.messages(chat.id), (list) => list.length === 2)
        assert.strictEqual(messages[1]?.delivery, "draft")
        const contact = present((yield* Contacts.use((contacts) => contacts.list))[0])
        assert.strictEqual(contact.channels.telegram, "@anna_k")
        assert.strictEqual(contact.ownerId, agent.id)
        assert.strictEqual(contact.source, "Telegram")

        const sent = yield* telegram.sendDraft(present(messages[1]).id)
        assert.strictEqual(sent.delivery, "sent")
        assert.deepStrictEqual(fake.sent, [{ chatId: "5001", text: "Hello from Nino", businessConnectionId: null }])

        // Telegram keeps sending an update until the offset moves past it.
        yield* Effect.sleep(100)
        assert.lengthOf(yield* telegram.messages(chat.id), 2)
      })
    )
  })

  it.live("answers in the business account's chats, and leaves the owner's own messages alone", () => {
    const { telegram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const telegram = yield* Telegram
        yield* connectBot(fake.validToken, true)

        fake.receive({ text: "Hi", businessConnectionId: "biz-1", chatId: "9001", fromId: "9001", username: "levan" })
        yield* Effect.sleep(100)
        assert.lengthOf(yield* telegram.chats, 0, "Nothing comes from an account that never connected")

        fake.connectBusiness()
        const status = yield* eventually(telegram.status, (item) => item.business !== null)
        assert.deepStrictEqual(status.business, { name: "Northwind Studio", username: "northwind", enabled: true })

        fake.receive({
          text: "Hello?",
          businessConnectionId: "biz-1",
          chatId: "9001",
          fromId: "9001",
          username: "levan"
        })
        fake.receive({ text: "I answer this one", businessConnectionId: "biz-1", chatId: "9001", fromId: "777" })
        yield* eventually(
          Effect.sync(() => fake.sent),
          (sent) => sent.length === 1
        )
        assert.deepStrictEqual(fake.sent[0], { chatId: "9001", text: "Hello from Nino", businessConnectionId: "biz-1" })
        const chat = present((yield* telegram.chats)[0])
        assert.strictEqual(chat.via, "business")
        assert.lengthOf(yield* telegram.messages(chat.id), 2)

        fake.connectBusiness(false)
        yield* eventually(telegram.status, (item) => item.business?.enabled === false)
        const refused = yield* telegram.send(chat.id, "Still there?").pipe(Effect.flip)
        assert.strictEqual(refused._tag, "TelegramSendFailed")
      })
    )
  })

  it.live("stops when the token is revoked, and stops listening when disconnected", () => {
    const { telegram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const telegram = yield* Telegram
        yield* connectBot(fake.validToken)

        yield* telegram.disconnect
        const polls = fake.polls()
        yield* Effect.sleep(100)
        assert.isTrue(fake.polls() - polls <= 1)
        assert.isNull((yield* telegram.status).bot)

        yield* telegram.connect({ token: fake.validToken })
        yield* eventually(telegram.status, (status) => status.online)
        fake.revoke()
        const stopped = yield* eventually(telegram.status, (status) => status.problem !== null)
        assert.include(stopped.problem ?? "", "token")
        assert.isFalse(stopped.online)
      })
    )
  })

  it.live("hands a chat over only when a person sends the draft that asks for it, and takes it back", () => {
    const { telegram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const telegram = yield* Telegram
        yield* connectBot(fake.validToken)
        const draftsOf = (chatId: ConversationId) =>
          telegram.messages(chatId).pipe(Effect.map((list) => list.filter((item) => item.delivery === "draft")))

        fake.receive({ text: "What is your company?" })
        const chat = present((yield* eventually(telegram.chats, (list) => list[0]?.drafts === 1))[0])
        const asking = present((yield* draftsOf(chat.id))[0])
        assert.strictEqual(asking.handoff, "No description of the company")
        assert.isNull(chat.handoff, "Nobody takes over before the draft is sent")

        // Throwing the draft away keeps the employee answering.
        yield* telegram.discardDraft(asking.id)
        fake.receive({ text: "?" })
        const next = present((yield* eventually(draftsOf(chat.id), (list) => list.length === 1))[0])
        assert.strictEqual(next.text, "Hello from Nino")
        yield* telegram.discardDraft(next.id)

        // Sending it tells the customer a colleague takes over, so a person does.
        fake.receive({ text: "Tell me about the company" })
        const again = present((yield* eventually(draftsOf(chat.id), (list) => list.length === 1))[0])
        yield* telegram.sendDraft(again.id)
        const handedOver = present((yield* telegram.chats)[0])
        assert.strictEqual(handedOver.handoff, "No description of the company")
        const before = (yield* telegram.messages(chat.id)).length
        fake.receive({ text: "Hello?" })
        yield* eventually(telegram.messages(chat.id), (list) => list.length === before + 1)
        yield* Effect.sleep(100)
        assert.lengthOf(yield* draftsOf(chat.id), 0, "The employee stays quiet while a person has the chat")

        yield* telegram.resume(chat.id)
        assert.isNull(present((yield* telegram.chats)[0]).handoff)
        fake.receive({ text: "Anyone?" })
        yield* eventually(draftsOf(chat.id), (list) => list.length === 1)
      })
    )
  })
})
