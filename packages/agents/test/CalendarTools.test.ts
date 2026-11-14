import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, CurrentBusiness, Store } from "@scope-bot/db"
import {
  type ActionPolicy,
  atZoned,
  BusinessId,
  type ChannelSettings,
  ConversationId,
  defaultCalendarSettings,
  defaultWeekHours,
  emptyServiceDetails
} from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { AgentChat, parseReply } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { Calendar } from "../src/Calendar.ts"
import { CalendarTools, parseToolCalls } from "../src/CalendarTools.ts"
import { makeInbox } from "../src/ChannelInbox.ts"
import { ChatModel, type ChatRequest } from "../src/ChatModel.ts"
import { Contacts } from "../src/Contacts.ts"
import { Deals } from "../src/Deals.ts"
import { ModelProviders } from "../src/ModelProviders.ts"
import { Services } from "../src/Services.ts"

const ZONE = "Asia/Tbilisi"
/** Monday 9 November 2026, 12:00 in Tbilisi. */
const MONDAY_NOON = Date.UTC(2026, 10, 9, 8, 0)
const at = (day: string, time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return atZoned(day, hours * 60 + minutes, ZONE).toISOString()
}

const BOOK = '[[TOOL book {"service": "Filling", "specialist": "Tamar", "start": "2026-11-10 10:00"}]]'

/** What the employee says after its tools answered. */
const afterTools = (results: string) => {
  if (results.includes('"tool":"free_times"')) return "Tomorrow at 09:00 or 10:00 with Tamar. Which suits you?"
  if (results.includes('"ok":true')) return "Done! See you on Tuesday at 10:00."
  return "Sorry, that did not work. A colleague will help."
}

/** What the employee does with a customer's message: looks for times, books the one picked, or confirms. */
const toCustomer = (text: string, system: string) => {
  if (text === "1") return `[[TOOL confirm {"appointment": "${/- id ([^:\s]+):/.exec(system)?.[1] ?? ""}"}]]`
  if (text.includes("filling")) return '[[TOOL free_times {"service": "filling", "day": "2026-11-10"}]]'
  if (text.includes("10:00")) return BOOK
  return "Hello!"
}

/**
 * A model that looks for free times when asked, books when the customer picks
 * one, and then answers from what the tools returned.
 */
const scripted = (requests: Array<ChatRequest>) =>
  Layer.succeed(
    ChatModel,
    ChatModel.of({
      models: Effect.succeed({ defaultModel: "", models: [] }),
      reply: (request) =>
        Effect.sync(() => {
          requests.push(request)
          const last = request.turns.at(-1)
          const answer = last?.tool === true ? afterTools(last.text) : toCustomer(last?.text ?? "", request.system)
          return { text: answer, model: request.model, inputTokens: 1, outputTokens: 1 }
        })
    })
  )

const layerWith = (requests: Array<ChatRequest>) =>
  AgentChat.layer.pipe(
    Layer.provideMerge(CalendarTools.layerWithCalendar),
    Layer.provideMerge(Layer.mergeAll(Agents.layer, Contacts.layer, Services.layer, Deals.layer)),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provide(scripted(requests)),
    Layer.provideMerge(CalendarStorage.layerMemory),
    Layer.provideMerge(Store.layerMemory)
  )

/** A calendar that is on, with Tamar doing fillings, and Nino answering WhatsApp. */
const setup = (book: ActionPolicy = "auto") =>
  Effect.gen(function* () {
    yield* TestClock.setTime(MONDAY_NOON)
    const calendar = yield* Calendar
    const [pipeline] = yield* (yield* Deals).pipelines
    const booked = pipeline?.stages[1]
    if (booked === undefined) return yield* Effect.die("no stages")
    yield* calendar.saveSettings({
      ...defaultCalendarSettings,
      enabled: true,
      timeZone: ZONE,
      stageRules: { booked: booked.id, arrived: null, noShow: null, allCancelled: null }
    })
    const service = yield* (yield* Services).create({
      ...emptyServiceDetails,
      name: "Filling",
      price: 120,
      minutes: 60
    })
    const specialist = yield* calendar.createSpecialist({
      name: "Tamar Beridze",
      title: "Dentist",
      color: "#2F9BCB",
      userId: null,
      active: true,
      hours: defaultWeekHours,
      serviceIds: [service.id],
      timeOff: []
    })
    const agents = yield* Agents
    const hired = yield* agents.create({ name: "Nino", job: "Front desk", color: "#3B8BEB" })
    const agent = yield* agents.update(hired.id, {
      ...hired,
      permissions: { ...hired.permissions, bookAppointments: book }
    })
    return { calendar, service, specialist, agent }
  })

const sent: Array<string> = []
const sendText = (_address: string, text: string) =>
  Effect.sync(() => {
    sent.push(text)
    return `out-${sent.length}`
  })

const settingsFor = (agentId: ChannelSettings["agentId"], answersAlone: boolean): ChannelSettings => ({
  agentId,
  audience: "everyone",
  answersAlone
})

const customer = (externalId: string, text: string) => ({
  externalId,
  address: "995555000111@s.whatsapp.net",
  name: "Anna Kiknadze",
  phone: "995555000111",
  username: null,
  text
})

const run = <A, E>(
  requests: Array<ChatRequest>,
  effect: Effect.Effect<A, E, AgentChat | Agents | Calendar | Contacts | Deals | Services | Store | CalendarStorage>
) => effect.pipe(Effect.provide(layerWith(requests)), Effect.provideService(CurrentBusiness, BusinessId.make("astra")))

/** The customer asks for a filling, then picks 10:00 from what the employee offered. */
const bookInChat = (answersAlone: boolean, agentId: ChannelSettings["agentId"]) =>
  Effect.gen(function* () {
    const inbox = yield* makeInbox("whatsapp")
    const settings = settingsFor(agentId, answersAlone)
    yield* inbox.receive(customer("in-1", "Can I come tomorrow for a filling?"), settings, sendText)
    yield* inbox.receive(customer("in-2", "10:00 please"), settings, sendText)
    const [chat] = yield* inbox.chats
    if (chat === undefined) return yield* Effect.die("no chat")
    return { inbox, chat, messages: yield* inbox.messages(chat.conversation.id) }
  })

describe("CalendarTools", () => {
  it("reads tool calls and keeps them from the customer", () => {
    const text = `Let me check. [[TOOL free_times {"service": "Filling", "day": "2026-11-10"}]]`
    assert.deepStrictEqual(parseToolCalls(text), [
      { name: "free_times", input: { service: "Filling", day: "2026-11-10" } }
    ])
    assert.deepStrictEqual(parseToolCalls("[[TOOL book {not json}]]"), [{ name: "book", input: {} }])
    assert.strictEqual(parseReply(text).text, "Let me check.")
  })

  it.effect("offers only free times and holds the one picked until a person sends the draft", () => {
    const requests: Array<ChatRequest> = []
    return run(
      requests,
      Effect.gen(function* () {
        const { calendar, specialist, agent } = yield* setup()
        const { inbox, messages } = yield* bookInChat(false, agent.id)

        const system = requests[0]?.system ?? ""
        assert.include(system, "Tamar Beridze, Dentist: Filling (60 min)")
        assert.include(system, "[[TOOL book")
        const results = requests.find((request) => request.turns.at(-1)?.tool === true)?.turns.at(-1)?.text ?? ""
        assert.include(results, '"times":["09:00","09:30","10:00"')

        const draft = messages.find((message) => message.delivery === "draft" && message.text.startsWith("Done"))
        assert.strictEqual(draft?.appointment?.kind, "book")
        const [held] = yield* calendar.appointmentsFor({})
        assert.strictEqual(held?.status, "held")
        assert.strictEqual(held?.startsAt, at("2026-11-10", "10:00"))
        assert.strictEqual(held?.bookedBy.agentId, agent.id)
        const free = yield* calendar.slots({
          serviceId: held?.serviceId ?? null,
          specialistId: specialist.id,
          day: "2026-11-10",
          minutes: null
        })
        assert.notInclude(
          free.map((slot) => slot.startsAt),
          at("2026-11-10", "10:00"),
          "A held time is taken"
        )

        if (draft === undefined) return yield* Effect.die("no draft")
        yield* inbox.sendDraft(draft.id, undefined, sendText)
        const [booked] = yield* calendar.appointmentsFor({})
        assert.strictEqual(booked?.status, "booked")
        assert.isNotNull(booked?.dealId ?? null, "Booking starts a deal")
        assert.include(sent, "Done! See you on Tuesday at 10:00.")

        const actions = (yield* Store.use((store) => store.actions(agent.id))).map((action) => action.tool)
        assert.includeMembers(actions, ["calendar.free_times", "calendar.book"])
      })
    )
  })

  it.effect("lets the held time go when a person does not send the draft", () => {
    const requests: Array<ChatRequest> = []
    return run(
      requests,
      Effect.gen(function* () {
        const { calendar, agent } = yield* setup()
        const { inbox, messages } = yield* bookInChat(false, agent.id)
        const draft = messages.find((message) => message.appointment !== undefined)
        if (draft === undefined) return yield* Effect.die("no draft")
        yield* inbox.discardDraft(draft.id)
        const [appointment] = yield* calendar.appointmentsFor({})
        assert.strictEqual(appointment?.status, "held", "Not a cancellation: it never was a booking")
        const free = yield* calendar.slots({
          serviceId: appointment?.serviceId ?? null,
          specialistId: appointment?.specialistId ?? null,
          day: "2026-11-10",
          minutes: null
        })
        assert.include(
          free.map((slot) => slot.startsAt),
          at("2026-11-10", "10:00"),
          "The time is free again"
        )
      })
    )
  })

  it.effect("does not send a draft whose time was taken meanwhile", () => {
    const requests: Array<ChatRequest> = []
    return run(
      requests,
      Effect.gen(function* () {
        const { calendar, specialist, service, agent } = yield* setup()
        const { inbox, messages } = yield* bookInChat(false, agent.id)
        const draft = messages.find((message) => message.appointment !== undefined)
        if (draft === undefined) return yield* Effect.die("no draft")
        // The hold runs out, and a person gives the time to someone else.
        yield* TestClock.adjust("20 minutes")
        yield* calendar.book(
          {
            specialistId: specialist.id,
            serviceId: service.id,
            contactId: null,
            dealId: null,
            startsAt: at("2026-11-10", "10:00"),
            minutes: null,
            note: ""
          },
          { bookedBy: { agentId: null, channel: null } }
        )
        const failed = yield* inbox.sendDraft(draft.id, undefined, sendText).pipe(Effect.flip)
        assert.strictEqual(failed._tag, "TimeTaken")
        const still = (yield* inbox.messages(draft.conversationId)).find((message) => message.id === draft.id)
        assert.strictEqual(still?.delivery, "draft", "The reply stays a draft for the person to change")
      })
    )
  })

  it.effect("asks a person first when the employee books with approval and answers alone", () => {
    const requests: Array<ChatRequest> = []
    return run(
      requests,
      Effect.gen(function* () {
        const { calendar, agent } = yield* setup("approve")
        yield* bookInChat(true, agent.id)
        const [pending] = yield* calendar.appointmentsFor({})
        assert.strictEqual(pending?.status, "pending")
        const results = requests.at(-1)?.turns.at(-1)?.text ?? ""
        assert.include(results, "A colleague confirms it")
      })
    )
  })

  it.effect("cannot book when booking is not allowed", () => {
    const requests: Array<ChatRequest> = []
    return run(
      requests,
      Effect.gen(function* () {
        const { calendar, agent } = yield* setup("deny")
        yield* bookInChat(true, agent.id)
        assert.notInclude(requests[0]?.system ?? "", "[[TOOL book")
        assert.deepStrictEqual(yield* calendar.appointmentsFor({}), [])
        const results = requests.at(-1)?.turns.at(-1)?.text ?? ""
        assert.include(results, "You may not do this")
      })
    )
  })

  it.effect("tells nothing about the calendar while it is off", () => {
    const requests: Array<ChatRequest> = []
    return run(
      requests,
      Effect.gen(function* () {
        const { calendar, agent } = yield* setup()
        yield* calendar.saveSettings({ ...(yield* calendar.settings), enabled: false })
        const chat = yield* AgentChat
        yield* chat.send(agent.id, ConversationId.make(agent.id), "Hi")
        assert.notInclude(requests[0]?.system ?? "", "Calendar.")
        assert.include(requests[0]?.system ?? "", "You have no tools in this chat yet")
      })
    )
  })

  it.effect("confirms an appointment when the client answers a reminder", () => {
    const requests: Array<ChatRequest> = []
    return run(
      requests,
      Effect.gen(function* () {
        const { calendar, agent } = yield* setup()
        const { inbox } = yield* bookInChat(true, agent.id)
        yield* inbox.receive(customer("in-3", "1"), settingsFor(agent.id, true), sendText)
        assert.include(requests.at(-2)?.system ?? "", "This client's appointments")
        const [appointment] = yield* calendar.appointmentsFor({})
        assert.strictEqual(appointment?.status, "confirmed")
      })
    )
  })
})
