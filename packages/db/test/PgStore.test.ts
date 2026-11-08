import { assert, layer } from "@effect/vitest"
import {
  type Activity,
  ActivityId,
  type Agent,
  AgentId,
  ApprovalId,
  type ApprovalRequest,
  BusinessId,
  type ChatMessage,
  type Contact,
  ContactId,
  type Conversation,
  ConversationId,
  type Deal,
  DealId,
  DepartmentId,
  defaultSettings,
  emptyContactDetails,
  emptyDealDetails,
  emptyServiceDetails,
  MessageId,
  type Pipeline,
  PipelineId,
  type Service,
  ServiceId,
  StageId,
  UserId
} from "@scope-bot/domain"
import { Effect, Exit, Layer, Option, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { Accounts } from "../src/Accounts.ts"
import { CurrentBusiness } from "../src/CurrentBusiness.ts"
import { InstagramStorage } from "../src/InstagramStorage.ts"
import { migrate } from "../src/Migrations.ts"
import { pgStoreLayer } from "../src/PgStore.ts"
import { ProviderKeys } from "../src/ProviderKeys.ts"
import { Store } from "../src/Store.ts"
import { TelegramStorage } from "../src/TelegramStorage.ts"
import { testDatabaseLayer } from "../src/testing.ts"
import { WhatsAppStorage } from "../src/WhatsAppStorage.ts"

const secret = Redacted.make(Buffer.alloc(32, 7).toString("base64"))
const services = Layer.mergeAll(
  pgStoreLayer,
  Accounts.layer,
  ProviderKeys.layerPostgres(secret),
  WhatsAppStorage.layerPostgres(secret),
  TelegramStorage.layerPostgres(secret),
  InstagramStorage.layerPostgres(secret)
).pipe(Layer.provideMerge(testDatabaseLayer))

const at = "2026-11-07T10:00:00.123Z"

const agent = (id: string): Agent => ({
  ...defaultSettings({ name: "Nino", job: "Sales", color: "#000000" }),
  id: AgentId.make(id),
  role: null,
  pinned: true,
  createdAt: at
})

const contact = (id: string, extra: Partial<Contact> = {}): Contact => ({
  ...emptyContactDetails,
  id: ContactId.make(id),
  name: "Anna",
  summary: null,
  createdAt: at,
  ...extra
})

const pipeline = (id: string): Pipeline => ({
  id: PipelineId.make(id),
  name: "Sales",
  stages: [
    { id: StageId.make(`${id}-new`), name: "New", kind: "open", probability: 10 },
    { id: StageId.make(`${id}-won`), name: "Won", kind: "won", probability: 100 },
    { id: StageId.make(`${id}-lost`), name: "Lost", kind: "lost", probability: 0 }
  ],
  createdAt: at
})

const deal = (id: string, funnel: Pipeline, extra: Partial<Deal> = {}): Deal => ({
  ...emptyDealDetails,
  id: DealId.make(id),
  title: "Website",
  pipelineId: funnel.id,
  stageId: StageId.make(`${funnel.id}-new`),
  createdAt: at,
  stageChangedAt: at,
  closedAt: null,
  ...extra
})

const service = (id: string, extra: Partial<Service> = {}): Service => ({
  ...emptyServiceDetails,
  id: ServiceId.make(id),
  name: "Store",
  createdAt: at,
  ...extra
})

const activity = (id: string, extra: Partial<Activity> = {}): Activity => ({
  id: ActivityId.make(id),
  kind: "note",
  text: "Hi",
  contactId: null,
  dealId: null,
  agentId: null,
  done: false,
  dueAt: null,
  createdAt: at,
  ...extra
})

const conversation = (id: string, agentId: string): Conversation => ({
  id: ConversationId.make(id),
  agentId: AgentId.make(agentId),
  title: "Chat",
  createdAt: at
})

const message = (id: string, chat: Conversation, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: MessageId.make(id),
  agentId: chat.agentId,
  conversationId: chat.id,
  role: "customer",
  text: "Hello",
  createdAt: at,
  ...extra
})

/** Each test gets businesses of its own, so tests do not see each other. */
const newBusiness = Effect.gen(function* () {
  const accounts = yield* Accounts
  const businessId = BusinessId.make(crypto.randomUUID())
  yield* accounts.createBusiness(
    {
      id: UserId.make(crypto.randomUUID()),
      businessId,
      email: `${crypto.randomUUID()}@example.com`,
      name: "Owner",
      passwordHash: "hash",
      role: "owner"
    },
    "Northwind"
  )
  return businessId
})

const inBusiness =
  (business: BusinessId) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, CurrentBusiness, business)

layer(services, { timeout: "60 seconds" })("PgStore", (it) => {
  it.effect("has nothing left to migrate after starting", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* migrate, [])
    })
  )

  it.effect("refuses to run outside a business", () =>
    Effect.gen(function* () {
      const store = yield* Store
      assert.isTrue(Exit.isFailure(yield* Effect.exit(store.contacts)))
    })
  )

  it.effect("keeps the business profile and the provider preferences", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const profile = {
        name: "Northwind",
        address: "Rustaveli 1",
        phone: "",
        openingHours: "",
        about: "Да",
        currency: "USD"
      }
      const preferences = { defaultProvider: "codex", disabled: ["api"], hiddenModels: [] } as const

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveBusiness(profile)
          yield* store.savePreferences(preferences)
          assert.deepStrictEqual(yield* store.business, profile)
          assert.deepStrictEqual(yield* store.preferences, preferences)
        })
      )
    })
  )

  it.effect("reads back exactly what it saved", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const nino = agent("nino")
      const company = contact("northwind", { kind: "company", name: "Northwind" })
      const person = contact("anna", {
        channels: { phone: "+995 555", whatsapp: "", telegram: "@anna" },
        consent: { messages: true, marketing: false },
        companyId: company.id,
        ownerId: nino.id,
        tags: ["Client", "Приоритет"],
        summary: { text: "Wants a store", agentId: nino.id, updatedAt: at }
      })
      const funnel = pipeline("sales")
      const onlineStore = service("store", {
        price: 18000.5,
        pricing: "from",
        packages: [{ name: "Basic", description: "", duration: "6 weeks", price: 9000 }],
        sellerIds: [nino.id]
      })
      const website = deal("website", funnel, {
        contactId: person.id,
        ownerId: nino.id,
        amount: 1200.5,
        nextStepAt: "2026-11-30",
        closeDate: "2026-12-01",
        probability: 75,
        serviceIds: [onlineStore.id]
      })
      const task = activity("task", { kind: "task", dealId: website.id, dueAt: "2026-11-20", agentId: nino.id })
      const approval: ApprovalRequest = {
        id: ApprovalId.make("approval"),
        agentId: nino.id,
        dealId: website.id,
        contactId: person.id,
        title: "Offer 10% off",
        reason: "",
        status: "pending",
        createdAt: at,
        decidedAt: null
      }
      const chat = conversation("chat", "nino")
      const photo = message("photo", chat, {
        text: "",
        images: [{ mediaType: "image/png", data: "aGVsbG8=" }]
      })

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveAgent(nino)
          yield* store.saveContact(company)
          yield* store.saveContact(person)
          yield* store.savePipeline(funnel)
          yield* store.saveService(onlineStore)
          yield* store.saveDeal(website)
          yield* store.saveActivity(task)
          yield* store.saveApproval(approval)
          yield* store.saveConversation(chat)
          yield* store.appendMessage(photo)

          assert.deepStrictEqual(yield* store.agents, [nino])
          assert.deepStrictEqual(yield* store.contacts, [company, person])
          assert.deepStrictEqual(yield* store.pipelines, [funnel])
          assert.deepStrictEqual(yield* store.services, [onlineStore])
          assert.deepStrictEqual(yield* store.deals, [website])
          assert.deepStrictEqual(yield* store.activities, [task])
          assert.deepStrictEqual(yield* store.approvals, [approval])
          assert.deepStrictEqual(yield* store.messages(nino.id), [photo])
        })
      )
    })
  )

  it.effect("updates in place and keeps the order things were added in", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveContact(contact("a", { name: "First" }))
          yield* store.saveContact(contact("b", { name: "Second" }))
          yield* store.saveContact(contact("a", { name: "Renamed" }))

          assert.deepStrictEqual(
            (yield* store.contacts).map((item) => item.name),
            ["Renamed", "Second"]
          )
        })
      )
    })
  )

  it.effect("keeps stages in the given order and drops the removed one", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const funnel = pipeline("sales")
      const [first, second, third] = funnel.stages
      if (first === undefined || second === undefined || third === undefined) return assert.fail("no stages")

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.savePipeline(funnel)
          yield* store.savePipeline({ ...funnel, stages: [third, first] })

          assert.deepStrictEqual((yield* store.pipelines)[0]?.stages, [third, first])
        })
      )
    })
  )

  it.effect("shows a business only its own data", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const first = yield* newBusiness
      const second = yield* newBusiness

      yield* inBusiness(first)(store.saveContact(contact("shared-id", { name: "Mine" })))

      yield* inBusiness(second)(
        Effect.gen(function* () {
          assert.deepStrictEqual(yield* store.contacts, [])
          assert.isTrue(Option.isNone(yield* store.findContact(ContactId.make("shared-id"))))
          yield* store.removeContact(ContactId.make("shared-id"))
        })
      )

      const kept = yield* inBusiness(first)(store.contacts)
      assert.deepStrictEqual(
        kept.map((item) => item.name),
        ["Mine"]
      )
    })
  )

  it.effect("cannot overwrite a record of another business by reusing its id", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const first = yield* newBusiness
      const second = yield* newBusiness

      yield* inBusiness(first)(store.saveContact(contact("same", { name: "Mine" })))
      yield* inBusiness(second)(store.saveContact(contact("same", { name: "Theirs" })))

      const [mine] = yield* inBusiness(first)(store.contacts)
      const [theirs] = yield* inBusiness(second)(store.contacts)
      assert.strictEqual(mine?.name, "Mine")
      assert.strictEqual(theirs?.name, "Theirs")
    })
  )

  it.effect("refuses a link to a record of another business", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const first = yield* newBusiness
      const second = yield* newBusiness
      const funnel = pipeline("sales")

      yield* inBusiness(first)(store.saveContact(contact("anna")))
      const saved = yield* inBusiness(second)(
        store
          .savePipeline(funnel)
          .pipe(
            Effect.andThen(store.saveDeal(deal("stolen", funnel, { contactId: ContactId.make("anna") }))),
            Effect.exit
          )
      )

      assert.isTrue(Exit.isFailure(saved))
    })
  )

  it.effect("saves a deal and its services together or not at all", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const funnel = pipeline("sales")

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.savePipeline(funnel)
          yield* store.saveDeal(deal("website", funnel))

          const saved = yield* Effect.exit(
            store.saveDeal(deal("website", funnel, { title: "Changed", serviceIds: [ServiceId.make("missing")] }))
          )

          assert.isTrue(Exit.isFailure(saved))
          assert.strictEqual((yield* store.deals)[0]?.title, "Website")
        })
      )
    })
  )

  it.effect("keeps a deal's history when its contact goes, and removes the rest", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const funnel = pipeline("sales")
      const anna = contact("anna")
      const website = deal("website", funnel, { contactId: anna.id })

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveContact(anna)
          yield* store.savePipeline(funnel)
          yield* store.saveDeal(website)
          yield* store.saveActivity(activity("on-deal", { contactId: anna.id, dealId: website.id }))
          yield* store.saveActivity(activity("on-contact", { contactId: anna.id }))

          yield* store.removeContact(anna.id)

          assert.isNull((yield* store.deals)[0]?.contactId)
          const left = yield* store.activities
          assert.deepStrictEqual(
            left.map((item) => [item.id, item.contactId]),
            [["on-deal", null]]
          )
        })
      )
    })
  )

  it.effect("removes what depends on a deal, a service and an employee", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const funnel = pipeline("sales")
      const nino = agent("nino")
      const onlineStore = service("store", { sellerIds: [nino.id] })
      const website = deal("website", funnel, { ownerId: nino.id, serviceIds: [onlineStore.id] })
      const chat = conversation("chat", "nino")

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveAgent(nino)
          yield* store.savePipeline(funnel)
          yield* store.saveService(onlineStore)
          yield* store.saveDeal(website)
          yield* store.saveConversation(chat)
          yield* store.appendMessage(message("hello", chat))

          yield* store.removeService(onlineStore.id)
          assert.deepStrictEqual((yield* store.deals)[0]?.serviceIds, [])

          yield* store.removeAgent(nino.id)
          assert.isNull((yield* store.deals)[0]?.ownerId)
          assert.deepStrictEqual(yield* store.conversations(nino.id), [])
          assert.deepStrictEqual(yield* store.messages(nino.id), [])

          yield* store.saveActivity(activity("note", { dealId: website.id }))
          yield* store.removeDeal(website.id)
          assert.deepStrictEqual(yield* store.activities, [])
        })
      )
    })
  )

  it.effect("keeps employees when their department goes", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const department = { id: DepartmentId.make("sales"), name: "Sales", createdAt: at }

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveDepartment(department)
          yield* store.saveAgent({ ...agent("nino"), departmentId: department.id })

          yield* store.removeDepartment(department.id)

          assert.isNull((yield* store.agents)[0]?.departmentId)
        })
      )
    })
  )

  it.effect("keeps the audit log when a chat goes, and tracks handoffs", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const nino = agent("nino")
      const chat = conversation("chat", "nino")
      const action = {
        id: "action",
        agentId: nino.id,
        tool: "reply",
        status: "done",
        summary: "Replied",
        sourceMessageId: MessageId.make("hello"),
        model: "some-model",
        inputTokens: 10,
        outputTokens: 5,
        createdAt: at
      } as const
      const escalation = {
        id: "escalation",
        agentId: nino.id,
        conversationId: chat.id,
        reason: "Upset",
        createdAt: at,
        resolvedAt: null
      }

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveAgent(nino)
          yield* store.saveConversation(chat)
          yield* store.appendAction(action)
          yield* store.appendEscalation(escalation)
          assert.deepStrictEqual(yield* store.openEscalation(chat.id), Option.some(escalation))
          assert.deepStrictEqual(yield* store.openEscalations, [escalation])

          yield* store.resolveEscalation(chat.id, at)
          assert.isTrue(Option.isNone(yield* store.openEscalation(chat.id)))

          yield* store.saveConversation(conversation("other", "nino"))
          yield* store.removeConversation(chat.id)
          assert.deepStrictEqual(yield* store.actions(nino.id), [action])
        })
      )
    })
  )

  it.effect("searches text literally and leaves notes out", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const nino = agent("nino")
      const chat = conversation("chat", "nino")

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveAgent(nino)
          yield* store.saveConversation(chat)
          yield* store.appendMessage(message("price", chat, { text: "Какая ЦЕНА на 100%?" }))
          yield* store.appendMessage(message("secret", chat, { text: "цена for supervisors", role: "note" }))
          yield* store.appendMessage(message("latest", chat, { text: "Thanks" }))

          const found = yield* store.searchMessages("цена")
          assert.deepStrictEqual(
            found.map((item) => item.id),
            ["price", "latest"]
          )
          const wildcard = yield* store.searchMessages("%")
          assert.deepStrictEqual(
            wildcard.map((item) => item.id),
            ["price", "latest"]
          )
          assert.deepStrictEqual(
            (yield* store.searchMessages("")).map((item) => item.id),
            ["latest"]
          )
          assert.deepStrictEqual(
            (yield* store.lastMessages).map((item) => item.text),
            ["Thanks"]
          )
        })
      )
    })
  )

  it.effect("encrypts provider keys and keeps them per business", () =>
    Effect.gen(function* () {
      const keys = yield* ProviderKeys
      const sql = yield* SqlClient.SqlClient
      const first = yield* newBusiness
      const second = yield* newBusiness

      yield* inBusiness(first)(keys.save("openrouter", { key: "sk-very-secret" }))

      const stored = yield* sql<{ readonly keyEncrypted: string }>`SELECT key_encrypted FROM provider_keys
        WHERE business_id = ${first}`
      assert.notInclude(stored[0]?.keyEncrypted ?? "", "very-secret")

      const mine = yield* inBusiness(first)(keys.get("openrouter"))
      assert.strictEqual(Redacted.value(Option.getOrThrow(mine).key), "sk-very-secret")
      assert.isTrue(Option.isNone(yield* inBusiness(second)(keys.get("openrouter"))))

      yield* inBusiness(first)(keys.remove("openrouter"))
      assert.isTrue(Option.isNone(yield* inBusiness(first)(keys.get("openrouter"))))
    })
  )

  it.effect("keeps WhatsApp chats apart from tabs, with their drafts and the ids WhatsApp gave", () =>
    Effect.gen(function* () {
      const store = yield* Store
      const business = yield* newBusiness
      const anna = contact("anna", { channels: { phone: "", whatsapp: "+995577204518", telegram: "" } })
      const tab = conversation("tab", "nino")
      const whatsapp: Conversation = {
        ...conversation("wa", "nino"),
        channel: "whatsapp",
        address: "995577204518@s.whatsapp.net",
        contactId: anna.id
      }
      const draft = message("draft", whatsapp, { role: "agent", text: "Hi Anna", delivery: "draft" })

      yield* inBusiness(business)(
        Effect.gen(function* () {
          yield* store.saveAgent(agent("nino"))
          yield* store.saveContact(anna)
          yield* store.saveConversation(tab)
          yield* store.saveConversation(whatsapp)
          yield* store.appendMessage(message("said", tab, { text: "Tab text" }))
          yield* store.appendMessage(message("in", whatsapp, { externalId: "wa-1", text: "From Anna" }))
          yield* store.appendMessage(draft)
          yield* store.appendMessage(message("note", whatsapp, { role: "note", text: "Hidden" }))

          const chats = yield* store.channelChats("whatsapp")
          assert.lengthOf(chats, 1)
          assert.deepStrictEqual(chats[0]?.conversation, whatsapp)
          assert.strictEqual(chats[0]?.lastMessage?.id, "draft")
          assert.strictEqual(chats[0]?.lastMessage?.createdAt, at)
          assert.strictEqual(chats[0]?.drafts, 1)

          const found = yield* store.findChannelConversation("whatsapp", "995577204518@s.whatsapp.net")
          assert.deepStrictEqual(Option.getOrNull(found), whatsapp)
          assert.strictEqual(Option.getOrNull(yield* store.findExternalMessage("wa-1"))?.text, "From Anna")

          yield* store.saveMessage({ ...draft, text: "Hi Anna!", delivery: "sent", externalId: "wa-2" })
          assert.deepStrictEqual(Option.getOrNull(yield* store.findMessage(draft.id)), {
            ...draft,
            text: "Hi Anna!",
            delivery: "sent",
            externalId: "wa-2"
          })
          assert.deepStrictEqual(
            (yield* store.conversationMessages(whatsapp.id)).map((item) => item.id),
            ["in", "draft", "note"]
          )
          // Search covers the employee's own tabs only.
          assert.deepStrictEqual(
            (yield* store.searchMessages("Anna")).map((item) => item.id),
            ["said"]
          )
          const duplicate = yield* Effect.exit(store.appendMessage(message("again", whatsapp, { externalId: "wa-1" })))
          assert.isTrue(Exit.isFailure(duplicate))
        })
      )
    })
  )

  it.effect("keeps the WhatsApp link per business and encrypts the device keys", () =>
    Effect.gen(function* () {
      const storage = yield* WhatsAppStorage
      const store = yield* Store
      const sql = yield* SqlClient.SqlClient
      const first = yield* newBusiness
      const second = yield* newBusiness

      yield* inBusiness(first)(
        Effect.gen(function* () {
          yield* store.saveAgent(agent("nino"))
          assert.isNull((yield* storage.link).phone)
          yield* storage.saveLink({
            settings: { agentId: AgentId.make("nino"), audience: "contacts", answersAlone: false },
            phone: "+995555123456",
            linkedAt: at
          })
          yield* storage.writeSession([
            ["creds", '{"secret":"device key"}'],
            ["pre-key/1", "one"],
            ["pre-key/1", "two"],
            ["pre-key/2", "three"]
          ])
          yield* storage.writeSession([["pre-key/2", null]])
        })
      )

      const stored = yield* sql<{ readonly valueEncrypted: string }>`SELECT value_encrypted FROM whatsapp_session
        WHERE business_id = ${first}`
      assert.lengthOf(stored, 2)
      assert.isTrue(stored.every((row) => !row.valueEncrypted.includes("device key")))

      yield* inBusiness(first)(
        Effect.gen(function* () {
          assert.deepStrictEqual(yield* storage.link, {
            settings: { agentId: AgentId.make("nino"), audience: "contacts", answersAlone: false },
            phone: "+995555123456",
            linkedAt: at
          })
          assert.strictEqual(Option.getOrNull(yield* storage.readSession("pre-key/1")), "two")
          assert.isTrue(Option.isNone(yield* storage.readSession("pre-key/2")))
        })
      )
      assert.include(yield* storage.linkedBusinesses, first)
      assert.isTrue(Option.isNone(yield* inBusiness(second)(storage.readSession("creds"))))

      // An employee that goes leaves WhatsApp without one, not without its settings.
      yield* inBusiness(first)(store.removeAgent(AgentId.make("nino")))
      assert.isNull((yield* inBusiness(first)(storage.link)).settings.agentId)

      yield* inBusiness(first)(storage.clearSession)
      assert.isTrue(Option.isNone(yield* inBusiness(first)(storage.readSession("creds"))))
    })
  )

  it.effect("keeps the Telegram bot per business with its token encrypted", () =>
    Effect.gen(function* () {
      const storage = yield* TelegramStorage
      const store = yield* Store
      const sql = yield* SqlClient.SqlClient
      const first = yield* newBusiness
      const second = yield* newBusiness
      const link = {
        settings: { agentId: AgentId.make("nino"), audience: "everyone" as const, answersAlone: true },
        token: Redacted.make("123456:very-secret-token-value-1234567890"),
        bot: { username: "northwind_bot", name: "Northwind" },
        connectedAt: at,
        offset: 42,
        business: { connectionId: "biz", userId: "777", name: "Northwind Studio", username: "northwind", enabled: true }
      }

      yield* inBusiness(first)(store.saveAgent(agent("nino")))
      yield* inBusiness(first)(storage.saveLink(link))
      const stored = yield* sql<{ readonly tokenEncrypted: string }>`SELECT token_encrypted FROM telegram_links
        WHERE business_id = ${first}`
      assert.notInclude(stored[0]?.tokenEncrypted ?? "", "very-secret")

      const read = yield* inBusiness(first)(storage.link)
      assert.strictEqual(Redacted.value(read.token ?? Redacted.make("")), "123456:very-secret-token-value-1234567890")
      assert.deepStrictEqual({ ...read, token: null }, { ...link, token: null })
      assert.include(yield* storage.connectedBusinesses, first)
      assert.isNull((yield* inBusiness(second)(storage.link)).token)

      yield* inBusiness(first)(storage.saveLink({ ...link, token: null }))
      assert.notInclude(yield* storage.connectedBusinesses, first)
    })
  )

  it.effect("keeps the Instagram account per business, finds it by its id, and encrypts the token", () =>
    Effect.gen(function* () {
      const storage = yield* InstagramStorage
      const store = yield* Store
      const sql = yield* SqlClient.SqlClient
      const business = yield* newBusiness
      const link = {
        settings: { agentId: AgentId.make("nino"), audience: "contacts" as const, answersAlone: false },
        token: Redacted.make("ig-very-secret-token"),
        tokenExpiresAt: at,
        accountId: `acct-${crypto.randomUUID()}`,
        account: { username: "northwind.studio", name: "Northwind" },
        connectedAt: at
      }

      yield* inBusiness(business)(store.saveAgent(agent("nino")))
      yield* inBusiness(business)(storage.saveLink(link))
      const stored = yield* sql<{ readonly tokenEncrypted: string }>`SELECT token_encrypted FROM instagram_links
        WHERE business_id = ${business}`
      assert.notInclude(stored[0]?.tokenEncrypted ?? "", "very-secret")

      const read = yield* inBusiness(business)(storage.link)
      assert.deepStrictEqual({ ...read, token: null }, { ...link, token: null })
      assert.strictEqual(Redacted.value(read.token ?? Redacted.make("")), "ig-very-secret-token")
      assert.strictEqual(Option.getOrNull(yield* storage.businessForAccount(link.accountId)), business)

      yield* inBusiness(business)(storage.saveLink({ ...link, token: null }))
      assert.isTrue(Option.isNone(yield* storage.businessForAccount(link.accountId)))
    })
  )
})
