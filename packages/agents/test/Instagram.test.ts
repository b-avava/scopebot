import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, CurrentBusiness, InstagramStorage, Store } from "@scope-bot/db"
import { BusinessId } from "@scope-bot/domain"
import { makeFakeInstagram } from "@scope-bot/integrations/testing"
import { Effect, Layer, Option } from "effect"
import { AgentChat } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { CalendarTools } from "../src/CalendarTools.ts"
import { ChatModel } from "../src/ChatModel.ts"
import { Contacts } from "../src/Contacts.ts"
import { Instagram } from "../src/Instagram.ts"
import { ModelProviders } from "../src/ModelProviders.ts"

const setup = () => {
  const instagram = makeFakeInstagram()
  const model = Layer.succeed(
    ChatModel,
    ChatModel.of({
      models: Effect.succeed({ defaultModel: "", models: [] }),
      reply: (request) =>
        Effect.succeed({ text: "Hello from Nino", model: request.model, inputTokens: 1, outputTokens: 1 })
    })
  )
  const layer = Instagram.layer.pipe(
    Layer.provideMerge(AgentChat.layer),
    Layer.provideMerge(CalendarTools.layerWithCalendar),
    Layer.provideMerge(Agents.layer),
    Layer.provideMerge(Contacts.layer),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provide(model),
    Layer.provideMerge(CalendarStorage.layerMemory),
    Layer.provideMerge(Store.layerMemory),
    Layer.provideMerge(InstagramStorage.layerMemory),
    Layer.provide(instagram.layer)
  )
  const run = <A, E>(effect: Effect.Effect<A, E, Instagram | Agents | Store | InstagramStorage>) =>
    effect.pipe(Effect.provide(layer), Effect.provideService(CurrentBusiness, BusinessId.make("northwind")))
  return { instagram, run }
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

/** Signs in the way Instagram's redirect finishes it. */
const connect = (alone = false) =>
  Effect.gen(function* () {
    const instagram = yield* Instagram
    const agent = yield* hire
    yield* instagram.saveSettings({ agentId: agent.id, audience: "everyone", answersAlone: alone })
    const { url } = yield* instagram.login
    const state = present(new URL(url).searchParams.get("state") ?? undefined)
    assert.strictEqual(yield* instagram.finishLogin("good-code", state), "connected")
    return agent
  })

describe("Instagram", () => {
  it.live("needs an employee, signs in through Instagram once per login and shows the account", () => {
    const { run } = setup()
    return run(
      Effect.gen(function* () {
        const instagram = yield* Instagram
        assert.strictEqual((yield* instagram.login.pipe(Effect.flip))._tag, "InstagramNeedsAgent")

        const agent = yield* hire
        yield* instagram.saveSettings({ agentId: agent.id, audience: "everyone", answersAlone: false })
        const { url } = yield* instagram.login
        const login = new URL(url)
        assert.strictEqual(login.origin, "https://www.instagram.com")
        assert.strictEqual(login.searchParams.get("redirect_uri"), "https://crm.example.com/instagram/oauth/callback")
        const state = present(login.searchParams.get("state") ?? undefined)

        assert.strictEqual(yield* instagram.finishLogin("good-code", "made-up"), "failed")
        assert.strictEqual(yield* instagram.finishLogin("good-code", state), "connected")
        assert.strictEqual(yield* instagram.finishLogin("good-code", state), "failed", "A login works once")

        const status = yield* eventually(instagram.status, (item) => item.reachable !== null)
        assert.deepStrictEqual(status.account, { username: "northwind.studio", name: "Northwind" })
        assert.isTrue(status.reachable)
        assert.isTrue(status.configured)
      })
    )
  })

  it.live("trusts only signed webhooks, and drafts a reply for a new sender", () => {
    const { instagram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const instagram = yield* Instagram
        yield* connect()

        const forged = fake.webhook("anna", "Hi")
        assert.isFalse(yield* instagram.receiveWebhook(forged.body, "sha256=00"))
        assert.isFalse(yield* instagram.receiveWebhook(forged.body, undefined))

        const echo = fake.webhook("anna", "Sent from the phone", { is_echo: true })
        assert.isTrue(yield* instagram.receiveWebhook(echo.body, echo.signature))
        const real = fake.webhook("anna", "Can you start in December?")
        assert.isTrue(yield* instagram.receiveWebhook(real.body, real.signature))

        const chat = present((yield* eventually(instagram.chats, (list) => list[0]?.drafts === 1))[0])
        assert.strictEqual(chat.name, "Anna Kiknadze")
        assert.isNotNull(chat.lastCustomerAt)
        const messages = yield* instagram.messages(chat.id)
        assert.deepStrictEqual(
          messages.map((message) => message.text),
          ["Can you start in December?", "Hello from Nino"]
        )

        yield* instagram.sendDraft(present(messages[1]).id)
        assert.deepStrictEqual(fake.sent, [{ recipientId: "anna", text: "Hello from Nino", byPerson: false }])
      })
    )
  })

  it.live("lets a person answer late with the human agent tag, and nobody after a week", () => {
    const { instagram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const instagram = yield* Instagram
        const store = yield* Store
        yield* connect()
        const real = fake.webhook("levan", "Price?")
        yield* instagram.receiveWebhook(real.body, real.signature)
        const chat = present((yield* eventually(instagram.chats, (list) => list[0]?.drafts === 1))[0])
        const [question, draft] = yield* instagram.messages(chat.id)
        const ago = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

        yield* store.saveMessage({ ...present(question), createdAt: ago(30) })
        yield* instagram.sendDraft(present(draft).id)
        assert.isTrue(present(fake.sent[0]).byPerson, "Late answers carry the human agent tag")

        yield* store.saveMessage({ ...present(question), createdAt: ago(8 * 24) })
        const refused = yield* instagram.send(chat.id, "Still there?").pipe(Effect.flip)
        assert.strictEqual(refused._tag, "InstagramWindowClosed")
      })
    )
  })

  it.live("says when Instagram no longer accepts the access, and forgets it on disconnect", () => {
    const { instagram: fake, run } = setup()
    return run(
      Effect.gen(function* () {
        const instagram = yield* Instagram
        yield* connect()
        const real = fake.webhook("anna", "Hi")
        yield* instagram.receiveWebhook(real.body, real.signature)
        const chat = present((yield* eventually(instagram.chats, (list) => list.length === 1))[0])

        fake.revoke()
        yield* instagram.send(chat.id, "Hello").pipe(Effect.flip)
        assert.include((yield* instagram.status).problem ?? "", "Connect it again")

        const status = yield* instagram.disconnect
        assert.isNull(status.account)
        assert.isTrue(
          Option.isNone(yield* InstagramStorage.use((storage) => storage.businessForAccount("17841400000000001")))
        )
        assert.isTrue(Option.isSome(instagram.verifyWebhook("subscribe", "verify-me", "42")))
        assert.isTrue(Option.isNone(instagram.verifyWebhook("subscribe", "wrong", "42")))
      })
    )
  })
})
