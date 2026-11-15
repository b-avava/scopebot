import { NodeHttpServer } from "@effect/platform-node"
import { assert, layer } from "@effect/vitest"
import {
  Activities,
  ActivityLog,
  AgentChat,
  Agents,
  Approvals,
  CalendarTools,
  ChatModel,
  Coaching,
  Contacts,
  Deals,
  Departments,
  Instagram,
  ModelProviders,
  ReminderSenders,
  Reminders,
  Services,
  Suggestions,
  Telegram,
  Voice,
  WhatsApp
} from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import {
  Accounts,
  CalendarStorage,
  CurrentBusiness,
  InstagramStorage,
  ProviderKeys,
  pgStoreLayer,
  TelegramStorage,
  WhatsAppStorage
} from "@scope-bot/db"
import { testDatabaseLayer } from "@scope-bot/db/testing"
import {
  type AuthSession,
  emptyBusinessProfile,
  emptyContactDetails,
  ModelNotConfigured,
  UserId
} from "@scope-bot/domain"
import { makeFakeInstagram, makeFakeTelegram, makeFakeWhatsApp } from "@scope-bot/integrations/testing"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpRouter } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { SqlClient } from "effect/sql"
import { Auth } from "../src/Auth.ts"
import { ApiRoutes } from "../src/Http.ts"
import { InstagramRoutes } from "../src/InstagramRoutes.ts"
import { AuthorizationLayer } from "../src/Security.ts"
import { Signup } from "../src/Signup.ts"

const model = Layer.succeed(
  ChatModel,
  ChatModel.of({
    models: Effect.succeed({ defaultModel: "", models: [] }),
    reply: () => Effect.fail(new ModelNotConfigured())
  })
)

const instagramPhone = makeFakeInstagram()

// No recording reaches ElevenLabs here: only who may keep the key is tested.
const voice = Voice.layer.pipe(Layer.provide(ProviderKeys.layerMemory), Layer.provide(FetchHttpClient.layer))

const channels = Layer.mergeAll(Suggestions.layer, Coaching.layer, voice).pipe(
  Layer.provideMerge(Reminders.layer),
  Layer.provideMerge(ReminderSenders.layer),
  Layer.provideMerge(Layer.mergeAll(WhatsApp.layer, Telegram.layer, Instagram.layer))
)

const domain = channels.pipe(
  Layer.provideMerge(AgentChat.layer),
  Layer.provideMerge(CalendarTools.layerWithCalendar),
  Layer.provideMerge(Agents.layer),
  Layer.provideMerge(Contacts.layer),
  Layer.provideMerge(Departments.layer),
  Layer.provideMerge(Deals.layer),
  Layer.provideMerge(Services.layer),
  Layer.provideMerge(Activities.layer),
  Layer.provideMerge(Approvals.layer),
  Layer.provideMerge(ActivityLog.layer),
  Layer.provideMerge(ModelProviders.layerApiOnly),
  Layer.provide(model),
  Layer.provideMerge(pgStoreLayer),
  Layer.provideMerge(CalendarStorage.layerPostgres),
  Layer.provide(WhatsAppStorage.layerMemory),
  Layer.provide(makeFakeWhatsApp().layer),
  Layer.provide(TelegramStorage.layerMemory),
  Layer.provide(makeFakeTelegram().layer),
  Layer.provide(InstagramStorage.layerMemory),
  Layer.provide(instagramPhone.layer)
)

// Every test makes a business of its own, so sign-up stays open here. Setup.test.ts covers a closed server.
const security = AuthorizationLayer.pipe(
  Layer.provideMerge(Auth.layer),
  Layer.provide(Signup.layer({ open: true })),
  Layer.provideMerge(Accounts.layer)
)

/** The real API on real PostgreSQL. Only the model is replaced. */
const server = HttpRouter.serve(Layer.mergeAll(ApiRoutes, InstagramRoutes), {
  disableListenLog: true,
  disableLogger: true
}).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(security),
  Layer.provideMerge(domain),
  Layer.provideMerge(testDatabaseLayer)
)

const clientWith = (token: string | null) =>
  HttpApiClient.make(Api, {
    transformClient: HttpClient.mapRequest((request) =>
      token === null ? request : HttpClientRequest.bearerToken(request, token)
    )
  })

const signedIn = (session: AuthSession) => clientWith(session.token)

const anonymous = clientWith(null)

const password = "correct horse battery"

const email = () => `${crypto.randomUUID()}@example.com`

const register = (address = email()) =>
  anonymous.pipe(
    Effect.flatMap((client) =>
      client.auth.register({ payload: { businessName: "Northwind", name: "Owner", email: address, password } })
    )
  )

const person = { ...emptyContactDetails, name: "Anna" }

// Sessions expire in real time, so these tests keep the real clock.
layer(server, { timeout: "120 seconds", excludeTestServices: true })("Auth", (it) => {
  it.effect("keeps the health check public and everything else behind a session", () =>
    Effect.gen(function* () {
      const client = yield* anonymous

      assert.strictEqual((yield* client.system.health()).status, "ok")
      assert.isTrue((yield* client.auth.options()).signupOpen, "The sign-in screen asks before anyone signs in")

      const failure = yield* client.contacts.list().pipe(Effect.flip)
      assert.strictEqual(failure._tag, "Unauthorized")
    })
  )

  it.effect("rejects a made up token", () =>
    Effect.gen(function* () {
      const client = yield* clientWith("not-a-real-token")

      const failure = yield* client.account.me().pipe(Effect.flip)

      assert.strictEqual(failure._tag, "Unauthorized")
    })
  )

  it.effect("signs up, sets the business up and signs in", () =>
    Effect.gen(function* () {
      const address = email()
      const session = yield* register(address.toUpperCase())
      const client = yield* signedIn(session)

      assert.strictEqual(session.account.user.email, address)
      assert.strictEqual(session.account.user.role, "owner")
      assert.strictEqual((yield* client.account.me()).businessName, "Northwind")
      assert.lengthOf(yield* client.pipelines.list(), 1)

      const again = yield* (yield* anonymous).auth.login({ payload: { email: ` ${address} `, password } })
      assert.notStrictEqual(again.token, session.token)
    })
  )

  it.effect("keeps only hashes of passwords and tokens", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const session = yield* register()
      const id = session.account.user.id

      const [user] = yield* sql<{ readonly passwordHash: string }>`SELECT password_hash FROM users WHERE id = ${id}`
      const sessions = yield* sql<{ readonly tokenHash: string }>`SELECT token_hash FROM sessions WHERE user_id = ${id}`

      assert.match(user?.passwordHash ?? "", /^scrypt\$/)
      assert.notInclude(user?.passwordHash ?? "", password)
      assert.notInclude(
        sessions.map((row) => row.tokenHash),
        session.token
      )
    })
  )

  it.effect("refuses an email twice and leaves no empty business behind", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const address = email()
      yield* register(address)
      const before = yield* sql`SELECT id FROM businesses`

      const failure = yield* register(address.toUpperCase()).pipe(Effect.flip)

      assert.strictEqual(failure._tag, "EmailTaken")
      assert.lengthOf(yield* sql`SELECT id FROM businesses`, before.length)
    })
  )

  it.effect("needs a real email and a long enough password", () =>
    Effect.gen(function* () {
      const client = yield* anonymous
      const payload = { businessName: "Northwind", name: "Owner", email: email(), password }

      const short = yield* Effect.flip(client.auth.register({ payload: { ...payload, password: "short" } }))
      const notEmail = yield* Effect.flip(client.auth.register({ payload: { ...payload, email: "nobody" } }))

      assert.notStrictEqual(short._tag, "EmailTaken")
      assert.notStrictEqual(notEmail._tag, "EmailTaken")
    })
  )

  it.effect("answers the same for a wrong password and an unknown email", () =>
    Effect.gen(function* () {
      const client = yield* anonymous
      const address = email()
      yield* register(address)

      const wrong = yield* Effect.flip(client.auth.login({ payload: { email: address, password: "wrong password" } }))
      const unknown = yield* Effect.flip(client.auth.login({ payload: { email: email(), password } }))

      assert.strictEqual(wrong._tag, "WrongCredentials")
      assert.strictEqual(unknown._tag, "WrongCredentials")
    })
  )

  it.effect("stops guessing after too many wrong passwords", () =>
    Effect.gen(function* () {
      const client = yield* anonymous
      const accounts = yield* Accounts
      const address = email()
      yield* register(address)
      yield* Effect.forEach(Array.from({ length: 10 }), () => accounts.recordFailure(address))

      const failure = yield* Effect.flip(client.auth.login({ payload: { email: address, password } }))

      assert.strictEqual(failure._tag, "TooManyAttempts")
    })
  )

  it.effect("ends a session on logout, and on expiry", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const session = yield* register()
      const client = yield* signedIn(session)

      yield* client.account.logout()
      assert.strictEqual((yield* Effect.flip(client.account.me()))._tag, "Unauthorized")

      const address = session.account.user.email
      const next = yield* (yield* anonymous).auth.login({ payload: { email: address, password } })
      yield* sql`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = ${next.account.user.id}`

      const expired = yield* signedIn(next)
      assert.strictEqual((yield* Effect.flip(expired.account.me()))._tag, "Unauthorized")
    })
  )

  it.effect("changes the password and signs out other devices", () =>
    Effect.gen(function* () {
      const session = yield* register()
      const address = session.account.user.email
      const visitor = yield* anonymous
      const otherDevice = yield* signedIn(yield* visitor.auth.login({ payload: { email: address, password } }))
      const client = yield* signedIn(session)
      const next = "a new long password"

      const wrong = yield* Effect.flip(client.account.changePassword({ payload: { current: "not it at all", next } }))
      assert.strictEqual(wrong._tag, "WrongCredentials")

      yield* client.account.changePassword({ payload: { current: password, next } })

      assert.strictEqual((yield* client.account.me()).user.email, address)
      assert.strictEqual((yield* Effect.flip(otherDevice.account.me()))._tag, "Unauthorized")
      assert.strictEqual(
        (yield* Effect.flip(visitor.auth.login({ payload: { email: address, password } })))._tag,
        "WrongCredentials"
      )
      yield* visitor.auth.login({ payload: { email: address, password: next } })
    })
  )

  it.effect("keeps two businesses apart through the whole API", () =>
    Effect.gen(function* () {
      const first = yield* signedIn(yield* register())
      const second = yield* signedIn(yield* register())
      const anna = yield* first.contacts.create({ payload: person })

      assert.deepStrictEqual(yield* second.contacts.list(), [])
      const failure = yield* Effect.flip(second.contacts.update({ params: { id: anna.id }, payload: person }))
      assert.strictEqual(failure._tag, "ContactNotFound")
      assert.strictEqual(
        (yield* Effect.flip(second.contacts.remove({ params: { id: anna.id } })))._tag,
        "ContactNotFound"
      )
      assert.lengthOf(yield* first.contacts.list(), 1)

      const stolen = yield* Effect.flip(second.contacts.create({ payload: { ...person, companyId: anna.id } }))
      assert.strictEqual(stolen._tag, "ReferenceNotFound")
    })
  )

  it.effect("lets an invited person into the business, once", () =>
    Effect.gen(function* () {
      const owner = yield* signedIn(yield* register())
      const visitor = yield* anonymous
      yield* owner.contacts.create({ payload: person })
      const invite = yield* owner.team.invite({ payload: { role: "member" } })
      const payload = { code: invite.code, name: "Lasha", email: email(), password }

      const joined = yield* visitor.auth.join({ payload })

      assert.strictEqual(joined.account.user.role, "member")
      assert.lengthOf(yield* (yield* signedIn(joined)).contacts.list(), 1)
      assert.lengthOf(yield* owner.team.list(), 2)

      const again = yield* Effect.flip(visitor.auth.join({ payload: { ...payload, email: email() } }))
      assert.strictEqual(again._tag, "InviteInvalid")
    })
  )

  it.effect("keeps an invite when the email is taken, and refuses an expired one", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const session = yield* register()
      const owner = yield* signedIn(session)
      const visitor = yield* anonymous
      const invite = yield* owner.team.invite({ payload: { role: "admin" } })
      const payload = { code: invite.code, name: "Lasha", password }

      const taken = yield* Effect.flip(
        visitor.auth.join({ payload: { ...payload, email: session.account.user.email } })
      )
      assert.strictEqual(taken._tag, "EmailTaken")

      yield* sql`UPDATE invites SET expires_at = now() - interval '1 minute'
        WHERE business_id = ${session.account.businessId}`
      const expired = yield* Effect.flip(visitor.auth.join({ payload: { ...payload, email: email() } }))
      assert.strictEqual(expired._tag, "InviteInvalid")
    })
  )

  it.effect("keeps business settings and the team away from members", () =>
    Effect.gen(function* () {
      const session = yield* register()
      const owner = yield* signedIn(session)
      const invite = yield* owner.team.invite({ payload: { role: "member" } })
      const joined = yield* (yield* anonymous).auth.join({
        payload: { code: invite.code, name: "Lasha", email: email(), password }
      })
      const member = yield* signedIn(joined)

      const invited = yield* Effect.flip(member.team.invite({ payload: { role: "admin" } }))
      const saved = yield* Effect.flip(member.business.save({ payload: emptyBusinessProfile }))
      const key = yield* Effect.flip(
        member.providers.saveKey({ params: { id: "openrouter" }, payload: { key: "sk-1" } })
      )
      const removed = yield* Effect.flip(member.team.remove({ params: { id: session.account.user.id } }))
      const linked = yield* Effect.flip(member.whatsapp.link({ payload: {} }))
      const unlinked = yield* Effect.flip(member.whatsapp.unlink())
      const bot = yield* Effect.flip(member.telegram.connect({ payload: { token: makeFakeTelegram().validToken } }))
      const instagramLogin = yield* Effect.flip(member.instagram.login())

      assert.deepStrictEqual(
        [invited._tag, saved._tag, key._tag, removed._tag, linked._tag, unlinked._tag, bot._tag, instagramLogin._tag],
        ["Forbidden", "Forbidden", "Forbidden", "Forbidden", "Forbidden", "Forbidden", "Forbidden", "Forbidden"]
      )
      // Members still see the chats and can answer them.
      assert.strictEqual((yield* member.whatsapp.status()).state, "unlinked")
      assert.lengthOf(yield* member.whatsapp.chats(), 0)
      const needsAgent = yield* Effect.flip(owner.whatsapp.link({ payload: {} }))
      assert.strictEqual(needsAgent._tag, "WhatsAppNeedsAgent")
      assert.isNull((yield* member.telegram.status()).bot)
    })
  )

  it.effect("removes a member, who is signed out at once", () =>
    Effect.gen(function* () {
      const session = yield* register()
      const owner = yield* signedIn(session)
      const invite = yield* owner.team.invite({ payload: { role: "admin" } })
      const joined = yield* (yield* anonymous).auth.join({
        payload: { code: invite.code, name: "Lasha", email: email(), password }
      })
      const admin = yield* signedIn(joined)

      const removedOwner = yield* Effect.flip(admin.team.remove({ params: { id: session.account.user.id } }))
      assert.strictEqual(removedOwner._tag, "Forbidden")
      const removedSelf = yield* Effect.flip(owner.team.remove({ params: { id: session.account.user.id } }))
      assert.strictEqual(removedSelf._tag, "Forbidden")

      yield* owner.team.remove({ params: { id: joined.account.user.id } })

      assert.strictEqual((yield* Effect.flip(admin.account.me()))._tag, "Unauthorized")
      assert.lengthOf(yield* owner.team.list(), 1)
    })
  )

  it.effect("cannot remove a user of another business", () =>
    Effect.gen(function* () {
      const owner = yield* signedIn(yield* register())
      const other = yield* register()

      const failure = yield* Effect.flip(owner.team.remove({ params: { id: other.account.user.id } }))

      assert.strictEqual(failure._tag, "UserNotFound")
      assert.lengthOf(yield* (yield* signedIn(other)).team.list(), 1)
      assert.strictEqual(
        (yield* Effect.flip(owner.team.remove({ params: { id: UserId.make("missing") } })))._tag,
        "UserNotFound"
      )
    })
  )

  it.effect("answers Meta's webhook check and refuses unsigned webhooks, without a session", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const verified = yield* http.get(
        "/instagram/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"
      )
      assert.strictEqual(verified.status, 200)
      assert.strictEqual(yield* verified.text, "42")
      const wrong = yield* http.get("/instagram/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42")
      assert.strictEqual(wrong.status, 403)

      const { body, signature } = instagramPhone.webhook("anna", "Hi")
      const forged = yield* http.execute(
        HttpClientRequest.post("/instagram/webhook").pipe(HttpClientRequest.bodyText(body))
      )
      assert.strictEqual(forged.status, 403)
      const signed = yield* http.execute(
        HttpClientRequest.post("/instagram/webhook").pipe(
          HttpClientRequest.bodyText(body),
          HttpClientRequest.setHeader("x-hub-signature-256", signature)
        )
      )
      assert.strictEqual(signed.status, 200)

      const login = yield* http.get("/instagram/oauth/callback?code=good-code&state=made-up")
      assert.include(yield* login.text, "did not connect")
    })
  )
  it.effect("keeps each person's chats with an employee to themselves", () =>
    Effect.gen(function* () {
      const session = yield* register()
      const owner = yield* signedIn(session)
      const invite = yield* owner.team.invite({ payload: { role: "member" } })
      const joined = yield* (yield* anonymous).auth.join({
        payload: { code: invite.code, name: "Tamar", email: email(), password }
      })
      const member = yield* signedIn(joined)
      const agent = yield* owner.agents.create({ payload: { name: "Tako", job: "Answers the team", color: "#8A5CF0" } })

      // The model is not set up here, so only the question is kept. That is enough to see who sees it.
      const mine = yield* owner.chat.createConversation({ params: { id: agent.id } })
      yield* owner.chat
        .send({ params: { id: agent.id, conversationId: mine.id }, payload: { text: "Salaries for November" } })
        .pipe(Effect.ignore)

      const theirs = yield* member.chat.conversations({ params: { id: agent.id } })
      assert.strictEqual(theirs.length, 1, "A member gets a chat of their own")
      assert.notInclude(
        theirs.map((item) => item.id),
        mine.id
      )
      assert.notInclude(
        theirs.map((item) => String(item.id)),
        String(agent.id),
        "Nor the shared first chat"
      )
      const hidden = yield* member.chat
        .messages({ params: { id: agent.id, conversationId: mine.id } })
        .pipe(Effect.flip)
      assert.strictEqual(hidden._tag, "ConversationNotFound")
      const found = yield* member.search.run({ query: { q: "Salaries" } })
      assert.isFalse(JSON.stringify(found).includes("Salaries"), "Search leaves other people's chats out")
      const last = yield* member.agents.lastMessages()
      assert.isFalse(JSON.stringify(last).includes("Salaries"), "So does the team list")

      yield* member.chat
        .send({
          params: { id: agent.id, conversationId: theirs[0]?.id ?? mine.id },
          payload: { text: "My day tomorrow?" }
        })
        .pipe(Effect.ignore)
      const ownerSees = (yield* owner.chat.conversations({ params: { id: agent.id } })).map((item) => item.id)
      assert.notInclude(ownerSees, theirs[0]?.id ?? "", "The owner does not see the member's chat either")
      assert.include(ownerSees, mine.id)
    })
  )

  it.effect("shows the activity log to owners and admins, without other people's chats", () =>
    Effect.gen(function* () {
      const session = yield* register()
      const owner = yield* signedIn(session)
      const join = (role: "admin" | "member", name: string) =>
        owner.team.invite({ payload: { role } }).pipe(
          Effect.flatMap((invite) =>
            anonymous.pipe(
              Effect.flatMap((client) =>
                client.auth.join({ payload: { code: invite.code, name, email: email(), password } })
              )
            )
          ),
          Effect.flatMap(signedIn)
        )
      const admin = yield* join("admin", "Giorgi")
      const member = yield* join("member", "Tamar")
      const agent = yield* owner.agents.create({ payload: { name: "Tako", job: "Answers the team", color: "#8A5CF0" } })
      const query = { from: new Date(Date.now() - 60_000).toISOString(), timeZone: "Asia/Tbilisi" }

      // Without a model each question fails, and the log keeps that.
      const ask = (client: typeof owner) =>
        client.chat
          .createConversation({ params: { id: agent.id } })
          .pipe(
            Effect.tap((tab) =>
              client.chat
                .send({ params: { id: agent.id, conversationId: tab.id }, payload: { text: "Hi" } })
                .pipe(Effect.ignore)
            )
          )
      const ownerTab = yield* ask(owner)
      const adminTab = yield* ask(admin)

      const forbidden = yield* member.activity.list({ query }).pipe(Effect.flip)
      assert.strictEqual(forbidden._tag, "Forbidden", "Members do not supervise the employees")

      const seen = yield* owner.activity.list({ query })
      assert.deepStrictEqual(
        seen.entries.map((entry) => entry.chat?.id),
        [ownerTab.id],
        "Not even the owner sees an admin's own chat"
      )
      assert.strictEqual(seen.entries[0]?.action.status, "failed")
      assert.strictEqual(seen.entries[0]?.chat?.personName, "Owner")
      assert.deepStrictEqual(seen.counts.kinds.failed, 1)
      assert.strictEqual(seen.days.length, 1)

      const steps = yield* owner.activity.steps({ params: { id: seen.entries[0]?.action.id ?? "" } })
      assert.lengthOf(steps, 1)
      const adminAction = (yield* admin.activity.list({ query })).entries[0]
      assert.strictEqual(adminAction?.chat?.id, adminTab.id)
      const hidden = yield* owner.activity.steps({ params: { id: adminAction?.action.id ?? "" } }).pipe(Effect.flip)
      assert.strictEqual(hidden._tag, "ActionNotFound")

      const badZone = yield* owner.activity.list({ query: { ...query, timeZone: "Not/AZone" } }).pipe(Effect.flip)
      assert.notStrictEqual(badZone._tag, "Forbidden", "A zone the database might not know is refused first")
    })
  )

  it.effect("lets members suggest rules, and owners and admins decide them", () =>
    Effect.gen(function* () {
      const owner = yield* signedIn(yield* register())
      const invite = yield* owner.team.invite({ payload: { role: "member" } })
      const member = yield* signedIn(
        yield* (yield* anonymous).auth.join({ payload: { code: invite.code, name: "Tamar", email: email(), password } })
      )
      const agent = yield* owner.agents.create({ payload: { name: "Tako", job: "Answers the team", color: "#8A5CF0" } })
      const params = { id: agent.id }

      const added = yield* owner.coaching.addRule({ params, payload: { text: "Name prices in GEL" } })
      assert.strictEqual(added.status, "active")
      assert.strictEqual(added.text, "Name prices in GEL")
      assert.strictEqual(added.decidedBy?.name, "Owner")

      const suggested = yield* member.coaching.addRule({ params, payload: { text: "Ask before booking" } })
      assert.strictEqual(suggested.status, "suggested")
      assert.strictEqual(suggested.suggestedBy?.name, "Tamar")
      assert.isNull(suggested.decidedBy)

      const ruleParams = { id: agent.id, ruleId: suggested.id }
      const forbidden = yield* member.coaching
        .decideRule({ params: ruleParams, payload: { accept: true } })
        .pipe(Effect.flip)
      assert.strictEqual(forbidden._tag, "Forbidden", "A member cannot accept their own suggestion")
      const cannotRemove = yield* member.coaching
        .removeRule({ params: { id: agent.id, ruleId: added.id } })
        .pipe(Effect.flip)
      assert.strictEqual(cannotRemove._tag, "Forbidden")

      const accepted = yield* owner.coaching.decideRule({ params: ruleParams, payload: { accept: true } })
      assert.strictEqual(accepted.status, "active")
      assert.strictEqual(accepted.decidedBy?.name, "Owner")
      const again = yield* owner.coaching
        .decideRule({ params: ruleParams, payload: { accept: false } })
        .pipe(Effect.flip)
      assert.strictEqual(again._tag, "RuleNotFound", "A rule is decided once")

      const turnedOff = yield* owner.coaching.changeRule({
        params: { id: agent.id, ruleId: added.id },
        payload: { enabled: false }
      })
      assert.isFalse(turnedOff.enabled)
      assert.deepStrictEqual(
        (yield* member.coaching.rules({ params })).map((rule) => [rule.text, rule.status, rule.enabled]),
        [
          ["Name prices in GEL", "active", false],
          ["Ask before booking", "active", true]
        ]
      )

      // Without a model the question stays unanswered, and trying again fails the same way.
      const tab = yield* owner.chat.createConversation({ params })
      const chat = { id: agent.id, conversationId: tab.id }
      yield* owner.chat.send({ params: chat, payload: { text: "Hi" } }).pipe(Effect.ignore)
      const retried = yield* owner.chat.regenerate({ params: chat }).pipe(Effect.flip)
      assert.strictEqual(retried._tag, "ModelNotConfigured")
      const notTheirs = yield* member.chat.regenerate({ params: chat }).pipe(Effect.flip)
      assert.strictEqual(notTheirs._tag, "ConversationNotFound", "No one answers again in another person's chat")
      const empty = yield* owner.chat
        .regenerate({ params: { id: agent.id, conversationId: (yield* owner.chat.createConversation({ params })).id } })
        .pipe(Effect.flip)
      assert.strictEqual(empty._tag, "CannotAnswerAgain")
    })
  )

  it.effect("lets only owners and admins keep the key for speaking", () =>
    Effect.gen(function* () {
      const owner = yield* signedIn(yield* register())
      const invite = yield* owner.team.invite({ payload: { role: "member" } })
      const member = yield* signedIn(
        yield* (yield* anonymous).auth.join({ payload: { code: invite.code, name: "Tamar", email: email(), password } })
      )
      assert.isFalse((yield* member.voice.status()).configured)
      const forbidden = yield* member.voice.saveKey({ payload: { key: "xi-key" } }).pipe(Effect.flip)
      assert.strictEqual(forbidden._tag, "Forbidden")
      yield* owner.voice.saveKey({ payload: { key: "xi-key" } })
      assert.isTrue((yield* member.voice.status()).configured, "Members may speak once it is set")
      assert.strictEqual((yield* member.voice.removeKey().pipe(Effect.flip))._tag, "Forbidden")
    })
  )

  it.effect("lets a specialist change only their own appointments", () =>
    Effect.gen(function* () {
      const owner = yield* signedIn(yield* register())
      const invite = yield* owner.team.invite({ payload: { role: "member" } })
      const joined = yield* (yield* anonymous).auth.join({
        payload: { code: invite.code, name: "Tamar", email: email(), password }
      })
      const member = yield* signedIn(joined)
      const settings = yield* owner.calendar.settings()
      yield* owner.calendar.saveSettings({
        payload: { ...settings, enabled: true, minNoticeMinutes: 0, maxDaysAhead: 365 }
      })
      const week = Array.from({ length: 7 }, () => ({ open: true, from: "00:00", to: "23:30", breaks: [] }))
      const details = { title: "", color: "#2F9BCB", active: true, hours: week, serviceIds: [], timeOff: [] }
      const tamar = yield* owner.calendar.createSpecialist({
        payload: { ...details, name: "Tamar", userId: joined.account.user.id }
      })
      const giorgi = yield* owner.calendar.createSpecialist({ payload: { ...details, name: "Giorgi", userId: null } })
      const start = new Date(Date.now() + 3 * 24 * 3600000)
      start.setUTCHours(8, 0, 0, 0)
      const later = new Date(start.getTime() + 3 * 3600000).toISOString()
      const input = {
        serviceId: null,
        contactId: null,
        dealId: null,
        startsAt: start.toISOString(),
        minutes: 60,
        note: ""
      }
      const theirs = yield* owner.calendar.book({ payload: { ...input, specialistId: giorgi.id } })
      const mine = yield* owner.calendar.book({ payload: { ...input, specialistId: tamar.id } })

      const other = yield* member.calendar
        .move({ params: { id: theirs.id }, payload: { specialistId: giorgi.id, startsAt: later } })
        .pipe(Effect.flip)
      assert.strictEqual(other._tag, "AppointmentNotFound", "Another specialist's appointment is not theirs to move")
      const away = yield* member.calendar
        .move({ params: { id: mine.id }, payload: { specialistId: giorgi.id, startsAt: later } })
        .pipe(Effect.flip)
      assert.strictEqual(away._tag, "SpecialistNotFound", "Nor can they hand their own to someone else")
      const cancelled = yield* member.calendar
        .cancel({ params: { id: theirs.id }, payload: { reason: "" } })
        .pipe(Effect.flip)
      assert.strictEqual(cancelled._tag, "AppointmentNotFound")
      const moved = yield* member.calendar.move({
        params: { id: mine.id },
        payload: { specialistId: tamar.id, startsAt: later }
      })
      assert.strictEqual(moved.startsAt, later)
    })
  )

  it.effect("books on PostgreSQL without giving one time twice", () =>
    Effect.gen(function* () {
      const session = yield* register()
      const owner = yield* signedIn(session)
      const settings = yield* owner.calendar.settings()
      assert.isFalse(settings.enabled, "The calendar is off at first")
      yield* owner.calendar.saveSettings({
        payload: { ...settings, enabled: true, minNoticeMinutes: 0, maxDaysAhead: 365 }
      })
      const week = Array.from({ length: 7 }, () => ({ open: true, from: "00:00", to: "23:30", breaks: [] }))
      const details = {
        name: "Tamar",
        title: "",
        color: "#2F9BCB",
        userId: null,
        active: true,
        hours: week,
        serviceIds: [],
        timeOff: []
      }
      const tamar = yield* owner.calendar.createSpecialist({ payload: details })
      const other = yield* owner.calendar.createSpecialist({ payload: { ...details, name: "Giorgi" } })

      const start = new Date(Date.now() + 3 * 24 * 3600000)
      start.setUTCHours(8, 0, 0, 0)
      const input = {
        specialistId: tamar.id,
        serviceId: null,
        contactId: null,
        dealId: null,
        startsAt: start.toISOString(),
        minutes: 60,
        note: ""
      }
      const booked = yield* owner.calendar.book({ payload: input })
      assert.strictEqual(booked.status, "booked")
      const overlap = new Date(start.getTime() + 30 * 60000).toISOString()
      const clash = yield* owner.calendar.book({ payload: { ...input, startsAt: overlap } }).pipe(Effect.flip)
      assert.strictEqual(clash._tag, "TimeTaken")
      yield* owner.calendar.book({ payload: { ...input, specialistId: other.id, startsAt: overlap } })

      const from = new Date(start.getTime() - 3600000).toISOString()
      const to = new Date(start.getTime() + 4 * 3600000).toISOString()
      assert.strictEqual((yield* owner.calendar.appointments({ query: { from, to } })).length, 2)

      // A reminder is claimed once, so it never goes twice.
      const log = {
        appointmentId: booked.id,
        startsAt: booked.startsAt,
        minutesBefore: 120,
        outcome: "sent" as const,
        reason: "",
        at: new Date().toISOString()
      }
      const claims = yield* CalendarStorage.use((storage) =>
        Effect.all([storage.claimReminder(log), storage.claimReminder(log)])
      ).pipe(Effect.provideService(CurrentBusiness, session.account.businessId))
      assert.deepStrictEqual(claims, [true, false])
      yield* CalendarStorage.use((storage) =>
        storage.saveReminder({ ...log, outcome: "failed", reason: "WhatsApp is not connected" })
      ).pipe(Effect.provideService(CurrentBusiness, session.account.businessId))
      const reminders = yield* owner.calendar.reminders({ params: { id: booked.id } })
      assert.deepStrictEqual(
        reminders.map((item) => [item.minutesBefore, item.outcome, item.reason, item.startsAt]),
        [[120, "failed", "WhatsApp is not connected", booked.startsAt]]
      )

      yield* owner.calendar.cancel({ params: { id: booked.id }, payload: { reason: "The client asked" } })
      yield* owner.calendar.book({ payload: { ...input, startsAt: overlap } })
    })
  )
})
