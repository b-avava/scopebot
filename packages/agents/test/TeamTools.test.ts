import { assert, describe, it } from "@effect/vitest"
import { CalendarStorage, type ChatViewer, CurrentViewer, Store } from "@scope-bot/db"
import {
  AgentId,
  atZoned,
  type ChatMessage,
  ConversationId,
  defaultCalendarSettings,
  defaultWeekHours,
  emptyContactDetails,
  emptyServiceDetails,
  UserId
} from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { AgentChat } from "../src/AgentChat.ts"
import { Agents } from "../src/Agents.ts"
import { Calendar } from "../src/Calendar.ts"
import { CalendarTools } from "../src/CalendarTools.ts"
import { ChatModel, type ChatRequest } from "../src/ChatModel.ts"
import { Contacts } from "../src/Contacts.ts"
import { ModelProviders } from "../src/ModelProviders.ts"
import { ReminderSenders, Reminders } from "../src/Reminders.ts"
import { Services } from "../src/Services.ts"
import { Suggestions } from "../src/Suggestions.ts"
import { freeGaps } from "../src/TeamTools.ts"

const ZONE = "Asia/Tbilisi"
/** Monday 9 November 2026, 12:00 in Tbilisi. */
const MONDAY_NOON = Date.UTC(2026, 10, 9, 8, 0)
const at = (day: string, time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  return atZoned(day, hours * 60 + minutes, ZONE).toISOString()
}

/** What the assistant does with a question: looks up the day, or suggests a move. */
const toPerson = (text: string) => {
  const moving = /^Move (\S+) to (.+)$/.exec(text)
  if (moving !== null) return `[[TOOL move {"appointment": "${moving[1]}", "start": "${moving[2]}"}]]`
  if (text.includes("Giorgi")) return '[[TOOL schedule {"day": "2026-11-10", "specialist": "Giorgi"}]]'
  return '[[TOOL schedule {"day": "2026-11-10", "specialist": "me"}]]'
}

const afterTools = (results: string) => {
  if (results.includes('"suggested"')) return "Tuesday 15:00 is free. Should I move it?"
  if (results.includes('"ok":true')) return "Here is your day."
  return "I can't see that."
}

const scripted = (requests: Array<ChatRequest>) =>
  Layer.succeed(
    ChatModel,
    ChatModel.of({
      models: Effect.succeed({ defaultModel: "", models: [] }),
      reply: (request) =>
        Effect.sync(() => {
          requests.push(request)
          const last = request.turns.at(-1)
          const text = last?.tool === true ? afterTools(last.text) : toPerson(last?.text ?? "")
          return { text, model: request.model, inputTokens: 1, outputTokens: 1 }
        })
    })
  )

interface Told {
  readonly chatId: string
  readonly text: string
}

const layerWith = (requests: Array<ChatRequest>, told: Array<Told>) =>
  Suggestions.layer.pipe(
    Layer.provideMerge(Reminders.layer),
    Layer.provide(
      Layer.succeed(ReminderSenders, {
        whatsapp: (chatId, text) => Effect.sync(() => told.push({ chatId, text })),
        telegram: () => Effect.void,
        instagram: () => Effect.void
      })
    ),
    Layer.provideMerge(AgentChat.layer),
    Layer.provideMerge(CalendarTools.layerWithCalendar),
    Layer.provideMerge(Layer.mergeAll(Agents.layer, Contacts.layer, Services.layer)),
    Layer.provideMerge(ModelProviders.layerApiOnly),
    Layer.provide(scripted(requests)),
    Layer.provideMerge(CalendarStorage.layerMemory),
    Layer.provideMerge(Store.layerMemory)
  )

const tamarUser = UserId.make("user-tamar")
const asTamar: ChatViewer = { userId: tamarUser, name: "Tamar", seesShared: false }
const asOwner: ChatViewer = { userId: UserId.make("user-owner"), name: "Owner", seesShared: true }

/** Tamar and Giorgi take appointments; Tamar signs in. Each has a client tomorrow, and Anna has a WhatsApp chat. */
const setup = Effect.gen(function* () {
  yield* TestClock.setTime(MONDAY_NOON)
  const calendar = yield* Calendar
  const store = yield* Store
  yield* calendar.saveSettings({ ...defaultCalendarSettings, enabled: true, timeZone: ZONE, minNoticeMinutes: 0 })
  const service = yield* (yield* Services).create({ ...emptyServiceDetails, name: "Filling", minutes: 60 })
  const person = (name: string, userId: UserId | null) =>
    calendar.createSpecialist({
      name,
      title: "Dentist",
      color: "#2F9BCB",
      userId,
      active: true,
      hours: defaultWeekHours,
      serviceIds: [service.id],
      timeOff: []
    })
  const tamar = yield* person("Tamar Beridze", tamarUser)
  const giorgi = yield* person("Giorgi Lomidze", null)
  const contacts = yield* Contacts
  const anna = yield* contacts.create({
    ...emptyContactDetails,
    name: "Anna Kiknadze",
    consent: { messages: true, marketing: false }
  })
  const levan = yield* contacts.create({ ...emptyContactDetails, name: "Levan Gelashvili" })
  yield* store.saveConversation({
    id: ConversationId.make("wa-anna"),
    agentId: AgentId.make("nino"),
    title: "Anna Kiknadze",
    createdAt: at("2026-11-08", "10:00"),
    channel: "whatsapp",
    address: "995577204518@s.whatsapp.net",
    contactId: anna.id
  })
  const book = (specialistId: typeof tamar.id, contactId: typeof anna.id, time: string) =>
    calendar.book(
      {
        specialistId,
        serviceId: service.id,
        contactId,
        dealId: null,
        startsAt: at("2026-11-10", time),
        minutes: null,
        note: ""
      },
      { bookedBy: { agentId: null, channel: null } }
    )
  const annas = yield* book(tamar.id, anna.id, "10:00")
  const levans = yield* book(giorgi.id, levan.id, "11:00")
  const agent = yield* (yield* Agents).create({ name: "Tako", job: "Answers the team", color: "#8A5CF0" })
  return { calendar, agent, annas, levans }
})

const ask = (agentId: AgentId, text: string, viewer: ChatViewer) =>
  Effect.gen(function* () {
    const chat = yield* AgentChat
    const [tab] = yield* chat.conversations(agentId)
    if (tab === undefined) return yield* Effect.die("no tab")
    const sent = yield* chat.send(agentId, tab.id, text)
    return { tab, reply: sent.reply }
  }).pipe(Effect.provideService(CurrentViewer, viewer))

const lastResults = (requests: ReadonlyArray<ChatRequest>) => requests.at(-1)?.turns.at(-1)?.text ?? ""

describe("TeamTools", () => {
  it("finds the free parts of a day between breaks and appointments", () => {
    const tamar = {
      hours: defaultWeekHours.map((day) => ({ ...day, breaks: [{ from: "13:00", to: "14:00" }] })),
      timeOff: []
    } as never
    const taken = [{ startsAt: at("2026-11-10", "10:00"), endsAt: at("2026-11-10", "11:00") }] as never
    assert.deepStrictEqual(freeGaps(tamar, "2026-11-10", taken, ZONE), ["9:00–10:00", "11:00–13:00", "14:00–18:00"])
  })

  it.effect("shows a specialist only their own day", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const { agent, annas } = yield* setup
      const { reply } = yield* ask(agent.id, "What do I have tomorrow?", asTamar)
      assert.include(requests[0]?.system ?? "", "In the calendar they are Tamar Beridze")
      assert.include(requests[0]?.system ?? "", "format your answer with Markdown")
      assert.deepStrictEqual(reply?.cards, [
        { kind: "day", day: "2026-11-10", specialistId: annas.specialistId, appointmentIds: [annas.id] }
      ])
      const results = lastResults(requests)
      assert.include(results, "Anna Kiknadze")
      assert.notInclude(results, "Levan Gelashvili")
      assert.include(results, '"free":["9:00–10:00","11:00–18:00"]')

      yield* ask(agent.id, "And Giorgi?", asTamar)
      assert.include(lastResults(requests), "You see only your own appointments")
    }).pipe(Effect.provide(layerWith(requests, [])))
  })

  it.effect("shows owners and admins everyone", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const { agent } = yield* setup
      yield* ask(agent.id, "What does Giorgi have?", asOwner)
      assert.include(lastResults(requests), "Levan Gelashvili")
    }).pipe(Effect.provide(layerWith(requests, [])))
  })

  it.effect("moves only when the person agrees, and then tells the client", () => {
    const requests: Array<ChatRequest> = []
    const told: Array<Told> = []
    return Effect.gen(function* () {
      const { agent, annas, calendar } = yield* setup
      const { tab, reply } = yield* ask(agent.id, `Move ${annas.id} to 2026-11-10 15:00`, asTamar)
      assert.strictEqual(reply?.appointment?.kind, "move")
      assert.strictEqual((yield* calendar.find(annas.id)).startsAt, at("2026-11-10", "10:00"), "Nothing moved yet")
      if (reply === null) return yield* Effect.die("no reply")

      const suggestions = yield* Suggestions
      const decide = (decision: "do" | "leave") =>
        suggestions.decide(agent.id, tab.id, reply.id, decision).pipe(Effect.provideService(CurrentViewer, asTamar))
      const done = yield* decide("do")
      assert.strictEqual(done.appointment?.decided, "done")
      assert.strictEqual((yield* calendar.find(annas.id)).startsAt, at("2026-11-10", "15:00"))
      assert.deepStrictEqual(told, [
        {
          chatId: "wa-anna",
          text: "Hi Anna! Your appointment for Filling with Tamar Beridze has moved to Tue 10 Nov at 15:00."
        }
      ])
      const messages: ReadonlyArray<ChatMessage> = yield* (yield* AgentChat)
        .messages(agent.id, tab.id)
        .pipe(Effect.provideService(CurrentViewer, asTamar))
      assert.strictEqual(messages.at(-1)?.text, "Moved. Anna Kiknadze was told on WhatsApp.")
      const agreed = (yield* Store.use((store) => store.actions(agent.id))).at(-1)
      assert.deepStrictEqual(agreed?.decidedBy, { userId: asTamar.userId, name: asTamar.name, agreed: true })
      assert.strictEqual(agreed?.appointmentId, annas.id)
      assert.strictEqual(agreed?.conversationId, tab.id)
      const again = yield* decide("leave").pipe(Effect.flip)
      assert.strictEqual(again._tag, "SuggestionNotFound", "A suggestion is decided once")
    }).pipe(Effect.provide(layerWith(requests, told)))
  })

  it.effect("leaves the appointment as it was, and keeps others away from the suggestion", () => {
    const requests: Array<ChatRequest> = []
    const told: Array<Told> = []
    return Effect.gen(function* () {
      const { agent, annas, calendar } = yield* setup
      const { tab, reply } = yield* ask(agent.id, `Move ${annas.id} to 2026-11-10 15:00`, asTamar)
      if (reply === null) return yield* Effect.die("no reply")
      const suggestions = yield* Suggestions
      const stranger = yield* suggestions
        .decide(agent.id, tab.id, reply.id, "do")
        .pipe(Effect.provideService(CurrentViewer, asOwner), Effect.flip)
      assert.strictEqual(stranger._tag, "SuggestionNotFound", "Someone else's chat is not theirs to decide")
      const left = yield* suggestions
        .decide(agent.id, tab.id, reply.id, "leave")
        .pipe(Effect.provideService(CurrentViewer, asTamar))
      assert.strictEqual(left.appointment?.decided, "left")
      assert.strictEqual((yield* calendar.find(annas.id)).startsAt, at("2026-11-10", "10:00"))
      const declined = (yield* Store.use((store) => store.actions(agent.id))).at(-1)
      assert.deepStrictEqual(declined?.decidedBy, { userId: asTamar.userId, name: asTamar.name, agreed: false })
      assert.include(declined?.summary ?? "", "left the suggestion to move")
      assert.deepStrictEqual(told, [])
    }).pipe(Effect.provide(layerWith(requests, told)))
  })

  it.effect("suggests nothing about appointments the person cannot see", () => {
    const requests: Array<ChatRequest> = []
    return Effect.gen(function* () {
      const { agent, levans } = yield* setup
      const { reply } = yield* ask(agent.id, `Move ${levans.id} to 2026-11-10 15:00`, asTamar)
      assert.isUndefined(reply?.appointment)
      assert.include(lastResults(requests), "No such appointment")
    }).pipe(Effect.provide(layerWith(requests, [])))
  })
})
