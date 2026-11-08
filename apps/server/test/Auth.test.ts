import { NodeHttpServer } from "@effect/platform-node"
import { assert, layer } from "@effect/vitest"
import {
  Activities,
  AgentChat,
  Agents,
  Approvals,
  ChatModel,
  Contacts,
  Deals,
  Departments,
  ModelProviders,
  Services,
  Telegram,
  WhatsApp
} from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Accounts, pgStoreLayer, TelegramStorage, WhatsAppStorage } from "@scope-bot/db"
import { testDatabaseLayer } from "@scope-bot/db/testing"
import {
  type AuthSession,
  emptyBusinessProfile,
  emptyContactDetails,
  ModelNotConfigured,
  UserId
} from "@scope-bot/domain"
import { makeFakeTelegram, makeFakeWhatsApp } from "@scope-bot/integrations/testing"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { SqlClient } from "effect/sql"
import { Auth } from "../src/Auth.ts"
import { ApiRoutes } from "../src/Http.ts"
import { AuthorizationLayer } from "../src/Security.ts"

const model = Layer.succeed(
  ChatModel,
  ChatModel.of({
    models: Effect.succeed({ defaultModel: "", models: [] }),
    reply: () => Effect.fail(new ModelNotConfigured())
  })
)

const domain = Layer.mergeAll(WhatsApp.layer, Telegram.layer).pipe(
  Layer.provideMerge(AgentChat.layer),
  Layer.provideMerge(Agents.layer),
  Layer.provideMerge(Contacts.layer),
  Layer.provideMerge(Departments.layer),
  Layer.provideMerge(Deals.layer),
  Layer.provideMerge(Services.layer),
  Layer.provideMerge(Activities.layer),
  Layer.provideMerge(Approvals.layer),
  Layer.provideMerge(ModelProviders.layerApiOnly),
  Layer.provide(model),
  Layer.provideMerge(pgStoreLayer),
  Layer.provide(WhatsAppStorage.layerMemory),
  Layer.provide(makeFakeWhatsApp().layer),
  Layer.provide(TelegramStorage.layerMemory),
  Layer.provide(makeFakeTelegram().layer)
)

const security = AuthorizationLayer.pipe(Layer.provideMerge(Auth.layer), Layer.provideMerge(Accounts.layer))

/** The real API on real PostgreSQL. Only the model is replaced. */
const server = HttpRouter.serve(ApiRoutes, { disableListenLog: true, disableLogger: true }).pipe(
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

      assert.deepStrictEqual(
        [invited._tag, saved._tag, key._tag, removed._tag, linked._tag, unlinked._tag, bot._tag],
        ["Forbidden", "Forbidden", "Forbidden", "Forbidden", "Forbidden", "Forbidden", "Forbidden"]
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
})
