import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, CurrentBusiness, CurrentViewer, Store, WhatsAppStorage } from "@scope-bot/db"
import { BusinessId, ConversationId, emptyContactDetails, UserId } from "@scope-bot/domain"
import { makeFakeWhatsApp } from "@scope-bot/integrations/testing"
import { Effect, Layer } from "effect"
import { AgentChat } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { CalendarTools } from "../src/CalendarTools.ts"
import { ChatModel, type ChatRequest } from "../src/ChatModel.ts"
import { Contacts } from "../src/Contacts.ts"
import { ModelProviders } from "../src/ModelProviders.ts"
import { WhatsApp } from "../src/WhatsApp.ts"

/** The person from the team who decides about drafts. */
const tamar = { userId: UserId.make("tamar"), name: "Tamar", seesShared: true }

const setup = () => {
  const phone = makeFakeWhatsApp()
  const requests: Array<ChatRequest> = []
  const model = Layer.succeed(
    ChatModel,
    ChatModel.of({
      models: Effect.succeed({ defaultModel: "", models: [] }),
      reply: (request) => {
        requests.push(request)
        return Effect.succeed({ text: "Hello from Nino", model: request.model, inputTokens: 1, outputTokens: 1 })
      }
    })
  )
  const layer = WhatsApp.layer.pipe(
    Layer.provideMerge(AgentChat.layer),
    Layer.provideMerge(CalendarTools.layerWithCalendar),
    Layer.provideMerge(Agents.layer),
    Layer.provideMerge(Contacts.layer),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provide(model),
    Layer.provideMerge(CalendarStorage.layerMemory),
    Layer.provideMerge(Store.layerMemory),
    Layer.provideMerge(WhatsAppStorage.layerMemory),
    Layer.provide(phone.layer)
  )
  const run = <A, E>(effect: Effect.Effect<A, E, WhatsApp | AgentChat | Agents | Contacts | Store | WhatsAppStorage>) =>
    effect.pipe(Effect.provide(layer), Effect.provideService(CurrentBusiness, BusinessId.make("northwind")))
  return { phone, requests, run }
}

/** Events arrive on their own fibers, so tests wait for what they expect. */
const eventually = <A, E, R>(effect: Effect.Effect<A, E, R>, done: (value: A) => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 300; attempt++) {
      const value = yield* effect
      if (done(value)) return value
      yield* Effect.sleep(10)
    }
    return yield* Effect.die("It never happened")
  })

/** The item a test expects to be there. */
const present = <A>(item: A | undefined): A => {
  if (item === undefined) throw new Error("Expected an item")
  return item
}

const hire = Agents.use((agents) => agents.create({ name: "Nino", job: "Sales", color: "#3B8BEB" }))

/** An employee answers, the number is linked, and the phone is the one in the tests. */
const linkNumber = (phone: ReturnType<typeof makeFakeWhatsApp>, alone = false) =>
  Effect.gen(function* () {
    const whatsapp = yield* WhatsApp
    const agent = yield* hire
    yield* whatsapp.saveSettings({ agentId: agent.id, audience: "everyone", answersAlone: alone })
    yield* whatsapp.link({})
    yield* eventually(whatsapp.status, (status) => status.qr !== null)
    yield* Effect.promise(() => phone.link("995555123456"))
    yield* eventually(whatsapp.status, (status) => status.state === "linked")
    return agent
  })

const firstChat = WhatsApp.use((whatsapp) => eventually(whatsapp.chats, (chats) => chats.length > 0)).pipe(
  Effect.map((chats) => present(chats[0]))
)

describe("WhatsApp", () => {
  it.live("needs an employee before it links, then shows a QR code until the phone links", () => {
    const { phone, run } = setup()
    return run(
      Effect.gen(function* () {
        const whatsapp = yield* WhatsApp
        const refused = yield* whatsapp.link({}).pipe(Effect.flip)
        assert.strictEqual(refused._tag, "WhatsAppNeedsAgent")

        const agent = yield* hire
        yield* whatsapp.saveSettings({ agentId: agent.id, audience: "everyone", answersAlone: false })
        const linking = yield* whatsapp.link({})
        assert.strictEqual(linking.state, "linking")

        const shown = yield* eventually(whatsapp.status, (status) => status.qr !== null)
        const rows = present(shown.qr ?? undefined)
        assert.isTrue(rows.every((row) => /^[01]+$/.test(row) && row.length === rows.length))

        yield* Effect.promise(() => phone.link("995555123456"))
        const linked = yield* eventually(whatsapp.status, (status) => status.state === "linked")
        assert.strictEqual(linked.phone, "+995555123456")
        assert.isTrue(linked.online)
        assert.isNull(linked.qr)
        assert.isNotNull(linked.linkedAt)
      })
    )
  })

  it.live("links with a code typed on the phone", () => {
    const { phone, run } = setup()
    return run(
      Effect.gen(function* () {
        const whatsapp = yield* WhatsApp
        const agent = yield* hire
        yield* whatsapp.saveSettings({ agentId: agent.id, audience: "everyone", answersAlone: false })
        yield* whatsapp.link({ phone: "+995 555 12 34 56" })

        const status = yield* eventually(whatsapp.status, (item) => item.pairingCode !== null)
        assert.strictEqual(status.pairingCode, "ABCD-1234")
        assert.isNull(status.qr)
        assert.deepStrictEqual(phone.pairingRequests, ["995555123456"])
      })
    )
  })

  it.live("turns a new sender into a contact and drafts a reply that waits for a person", () => {
    const { phone, run } = setup()
    return run(
      Effect.gen(function* () {
        const whatsapp = yield* WhatsApp
        const agent = yield* linkNumber(phone)
        phone.receive({ text: "Can you start in December?" })

        const chat = yield* firstChat
        assert.strictEqual(chat.name, "Anna")
        assert.strictEqual(chat.phone, "+995577204518")
        const messages = yield* eventually(whatsapp.messages(chat.id), (list) => list.length === 2)
        assert.deepStrictEqual(
          messages.map((message) => [message.role, message.delivery]),
          [
            ["customer", undefined],
            ["agent", "draft"]
          ]
        )
        assert.lengthOf(phone.sent, 0)

        const contact = (yield* Contacts.use((contacts) => contacts.list))[0]
        assert.strictEqual(contact?.channels.whatsapp, "+995577204518")
        assert.strictEqual(contact?.ownerId, agent.id)
        assert.strictEqual(contact?.source, "WhatsApp")
        assert.strictEqual((yield* whatsapp.status).drafts, 1)
        const states = yield* Agents.use((agents) => agents.statuses)
        assert.strictEqual(states[0]?.state, "approval")
        // Customer chats are not tabs of the employee.
        assert.lengthOf(yield* AgentChat.use((chats) => chats.conversations(agent.id)), 1)
      })
    )
  })

  it.live("sends a draft as it is or changed, and a thrown away draft never reaches the model again", () => {
    const { phone, requests, run } = setup()
    return run(
      Effect.gen(function* () {
        const whatsapp = yield* WhatsApp
        yield* linkNumber(phone)
        phone.receive({ text: "Hi" })
        const chat = yield* firstChat
        const first = yield* eventually(whatsapp.messages(chat.id), (list) => list.length === 2)

        const draftAction = (yield* Store.use((store) => store.actions(present(first[1]).agentId))).at(-1)
        assert.strictEqual(draftAction?.replyId, present(first[1]).id, "The log can tell the draft still waits")
        assert.strictEqual(draftAction?.conversationId, chat.id)

        const sent = yield* whatsapp
          .sendDraft(present(first[1]).id, "Hi Anna, how can I help?")
          .pipe(Effect.provideService(CurrentViewer, tamar))
        assert.strictEqual(sent.delivery, "sent")
        assert.deepStrictEqual((yield* Store.use((store) => store.actions(sent.agentId))).at(-1)?.decidedBy, {
          userId: tamar.userId,
          name: tamar.name,
          agreed: true
        })
        assert.deepStrictEqual(phone.sent, [{ chat: "995577204518@s.whatsapp.net", text: "Hi Anna, how can I help?" }])
        const again = yield* whatsapp.sendDraft(present(first[1]).id).pipe(Effect.flip)
        assert.strictEqual(again._tag, "DraftNotFound")

        phone.receive({ text: "Price?" })
        const second = yield* eventually(whatsapp.messages(chat.id), (list) => list.length === 4)
        const discarded = yield* whatsapp
          .discardDraft(present(second[3]).id)
          .pipe(Effect.provideService(CurrentViewer, tamar))
        assert.strictEqual(discarded.delivery, "discarded")
        assert.strictEqual(
          (yield* Store.use((store) => store.actions(discarded.agentId))).at(-1)?.decidedBy?.agreed,
          false
        )

        phone.receive({ text: "Hello?" })
        yield* eventually(whatsapp.messages(chat.id), (list) => list.length === 6)
        assert.deepStrictEqual(
          requests.at(-1)?.turns.map((turn) => turn.text),
          ["Hi", "Hi Anna, how can I help?", "Price?", "Hello?"]
        )
      })
    )
  })

  it.live("answers alone when the business allows it, and a person can write too", () => {
    const { phone, run } = setup()
    return run(
      Effect.gen(function* () {
        const whatsapp = yield* WhatsApp
        yield* linkNumber(phone, true)
        phone.receive({ text: "Hi" })
        yield* eventually(
          Effect.sync(() => phone.sent),
          (sent) => sent.length === 1
        )
        assert.strictEqual(phone.sent[0]?.text, "Hello from Nino")

        const chat = yield* firstChat
        const written = yield* whatsapp.send(chat.id, " See you on Monday ")
        assert.strictEqual(written.role, "person")
        assert.strictEqual(written.delivery, "sent")
        assert.strictEqual(phone.sent[1]?.text, "See you on Monday")

        phone.failSending(true)
        const failed = yield* whatsapp.send(chat.id, "Again").pipe(Effect.flip)
        assert.strictEqual(failed._tag, "WhatsAppSendFailed")
        const messages = yield* whatsapp.messages(chat.id)
        assert.strictEqual(messages.at(-1)?.delivery, "failed")
      })
    )
  })

  it.live("answers only contacts when told to, and keeps the other messages for people", () => {
    const { phone, run } = setup()
    return run(
      Effect.gen(function* () {
        const whatsapp = yield* WhatsApp
        const agent = yield* linkNumber(phone)
        yield* whatsapp.saveSettings({ agentId: agent.id, audience: "contacts", answersAlone: false })
        yield* Contacts.use((contacts) =>
          contacts.create({
            ...emptyContactDetails,
            name: "Nika",
            channels: { phone: "+995 599 11 22 33", whatsapp: "", telegram: "" }
          })
        )

        phone.receive({ text: "Who is this?", chat: "995500000000@s.whatsapp.net", phone: "995500000000", name: "" })
        phone.receive({ text: "Hi, it is Nika", chat: "995599112233@s.whatsapp.net", phone: "995599112233" })
        const chats = yield* eventually(whatsapp.chats, (list) => list.length === 2)
        const stranger = present(chats.find((chat) => chat.phone === "+995500000000"))
        const known = present(chats.find((chat) => chat.phone === "+995599112233"))

        assert.isNull(stranger.contactId)
        assert.strictEqual(known.name, "Nika")
        yield* eventually(whatsapp.messages(known.id), (list) => list.length === 2)
        assert.lengthOf(yield* whatsapp.messages(stranger.id), 1)
        assert.lengthOf(yield* Contacts.use((contacts) => contacts.list), 1)
      })
    )
  })

  it.live("never stores a message twice and keeps customers apart", () => {
    const { phone, requests, run } = setup()
    return run(
      Effect.gen(function* () {
        const whatsapp = yield* WhatsApp
        yield* linkNumber(phone)
        phone.receive({ id: "same", text: "My card ends in 4242" })
        phone.receive({ id: "same", text: "My card ends in 4242" })
        const chat = yield* firstChat
        yield* eventually(whatsapp.messages(chat.id), (list) => list.length === 2)

        phone.receive({ text: "Hello", chat: "995511111111@s.whatsapp.net", phone: "995511111111", name: "Levan" })
        yield* eventually(whatsapp.chats, (list) => list.length === 2)
        yield* eventually(
          Effect.sync(() => requests.length),
          (count) => count === 2
        )
        assert.lengthOf(yield* whatsapp.messages(chat.id), 2)
        assert.notInclude(present(requests[1]).system, "4242")
        assert.notInclude(present(requests[1]).system, "Markdown", "A client gets the text as it is")
        assert.notInclude(JSON.stringify(present(requests[1]).turns), "4242")
      })
    )
  })

  it.live(
    "forgets the number when the phone removes the device, and reconnects after a drop",
    () => {
      const { phone, run } = setup()
      return run(
        Effect.gen(function* () {
          const whatsapp = yield* WhatsApp
          yield* linkNumber(phone)

          phone.drop()
          yield* eventually(
            Effect.sync(() => phone.connections()),
            (count) => count === 2
          )
          assert.isTrue((yield* eventually(whatsapp.status, (status) => status.online)).online)

          phone.removeDevice()
          const status = yield* eventually(whatsapp.status, (item) => item.state === "unlinked")
          assert.isNull(status.phone)
          assert.include(status.problem ?? "", "removed")
          const session = yield* WhatsAppStorage.use((storage) => storage.readSession("creds"))
          assert.isTrue(session._tag === "None")
          const refused = yield* whatsapp.send(ConversationId.make("none"), "Hi").pipe(Effect.flip)
          assert.strictEqual(refused._tag, "ConversationNotFound")
        })
      )
    },
    10_000
  )
})
