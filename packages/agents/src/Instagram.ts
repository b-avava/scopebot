import { randomBytes } from "node:crypto"
import { CurrentBusiness, InstagramStorage, requireBusiness, Store } from "@scope-bot/db"
import {
  type AgentNotFound,
  type BusinessId,
  type ChannelSettings,
  type ChatMessage,
  type ConversationId,
  type ConversationNotFound,
  type DraftNotFound,
  INSTAGRAM_PERSON_REPLY_DAYS,
  INSTAGRAM_REPLY_HOURS,
  type InstagramChat,
  type InstagramLogin,
  InstagramNeedsAgent,
  InstagramNotConfigured,
  InstagramNotConnected,
  InstagramSendFailed,
  type InstagramStatus,
  InstagramWindowClosed,
  type MessageId
} from "@scope-bot/domain"
import {
  authorizeUrl,
  InstagramClient,
  type InstagramClientError,
  type InstagramIncoming,
  InstagramSetup,
  parseWebhook,
  signatureMatches
} from "@scope-bot/integrations"
import { Context, Effect, FiberSet, Layer, Option, Redacted } from "effect"
import { Agents, nowIso } from "./Agents.ts"
import { makeInbox, type SendText } from "./ChannelInbox.ts"

const HOUR_MS = 60 * 60 * 1000
const LOGIN_MS = 15 * 60 * 1000
/** Tokens last 60 days; they are renewed when fewer than this many are left. */
const RENEW_DAYS = 15
const RENEW_CHECK_MS = 12 * HOUR_MS

type SendError = InstagramNotConnected | InstagramWindowClosed | InstagramSendFailed

const revoked = (error: InstagramClientError) => error.code === 190

/**
 * Instagram Direct as a channel, through the official API: the owner signs in
 * with Instagram, and Instagram sends new messages to this server's public
 * address. Every chat goes to one employee, and replies wait for a person until
 * the business lets the employee answer alone. A business may answer only
 * within a day of the customer's last message, and a person within a week.
 */
export class Instagram extends Context.Service<
  Instagram,
  {
    readonly status: Effect.Effect<InstagramStatus>
    saveSettings(settings: ChannelSettings): Effect.Effect<InstagramStatus, AgentNotFound>
    /** Where to sign in. The server finishes the connection when Instagram sends the person back. */
    readonly login: Effect.Effect<InstagramLogin, InstagramNotConfigured | InstagramNeedsAgent>
    /** Called by Instagram's redirect, outside any session: the state says whose login it was. */
    finishLogin(code: string, state: string): Effect.Effect<"connected" | "failed">
    readonly checkReachable: Effect.Effect<InstagramStatus>
    readonly disconnect: Effect.Effect<InstagramStatus>
    /** Meta checks the webhook address by asking it to repeat a challenge. */
    verifyWebhook(mode: string, token: string, challenge: string): Option.Option<string>
    /** False when the body is not signed by the app, so nothing in it is trusted. */
    receiveWebhook(body: string, signature: string | undefined): Effect.Effect<boolean>
    readonly chats: Effect.Effect<ReadonlyArray<InstagramChat>>
    messages(chatId: ConversationId): Effect.Effect<ReadonlyArray<ChatMessage>, ConversationNotFound>
    send(chatId: ConversationId, text: string): Effect.Effect<ChatMessage, ConversationNotFound | SendError>
    sendDraft(id: MessageId, text?: string): Effect.Effect<ChatMessage, DraftNotFound | SendError>
    discardDraft(id: MessageId): Effect.Effect<ChatMessage, DraftNotFound>
    resume(chatId: ConversationId): Effect.Effect<void, ConversationNotFound>
  }
>()("@scope-bot/agents/Instagram") {
  static readonly layer = Layer.effect(
    Instagram,
    Effect.gen(function* () {
      const store = yield* Store
      const storage = yield* InstagramStorage
      const client = yield* InstagramClient
      const { app } = yield* InstagramSetup
      const agents = yield* Agents
      const inbox = yield* makeInbox("instagram")
      const run = yield* FiberSet.makeRuntime()

      const logins = new Map<string, { readonly business: BusinessId; readonly until: number }>()
      const problems = new Map<BusinessId, string>()
      let reachable: boolean | null = null

      const inBusiness =
        (business: BusinessId) =>
        <A, E>(effect: Effect.Effect<A, E>) =>
          Effect.provideService(effect, CurrentBusiness, business)

      const noteRevoked = (error: InstagramClientError) =>
        Effect.gen(function* () {
          if (!revoked(error)) return
          problems.set(yield* requireBusiness, "Instagram no longer accepts Scope Bot's access. Connect it again.")
        })

      /** How long ago the customer at this address last wrote. */
      const sinceCustomer = (address: string) =>
        store.findChannelConversation("instagram", address).pipe(
          Effect.flatMap((chat) =>
            Option.isNone(chat) ? Effect.succeed([]) : store.conversationMessages(chat.value.id)
          ),
          Effect.map((said) => {
            const last = said.findLast((message) => message.role === "customer")
            return last === undefined ? Number.POSITIVE_INFINITY : Date.now() - Date.parse(last.createdAt)
          })
        )

      /** The time since the customer last wrote decides whether, and how, an answer may go. */
      const sendText =
        (byPerson: boolean): SendText<SendError> =>
        (address, text) =>
          Effect.gen(function* () {
            const { token } = yield* storage.link
            if (token === null) return yield* new InstagramNotConnected()
            const age = yield* sinceCustomer(address)
            const late = age > INSTAGRAM_REPLY_HOURS * HOUR_MS
            const tooLate = age > INSTAGRAM_PERSON_REPLY_DAYS * 24 * HOUR_MS
            if (tooLate || (late && !byPerson)) return yield* new InstagramWindowClosed()
            return yield* client.sendText(token, address, text, late).pipe(
              Effect.tapError(noteRevoked),
              Effect.mapError((error) => new InstagramSendFailed({ reason: error.reason }))
            )
          })

      const requireConnected = storage.link.pipe(
        Effect.flatMap((link) => (link.token === null ? Effect.fail(new InstagramNotConnected()) : Effect.void))
      )

      const receiveIn = (business: BusinessId, message: InstagramIncoming) =>
        Effect.gen(function* () {
          const stored = yield* storage.link
          if (stored.token === null) return
          const profile = yield* client
            .profile(stored.token, message.senderId)
            .pipe(Effect.orElseSucceed(() => ({ name: "", username: "" })))
          const username = profile.username === "" ? null : profile.username
          const result = yield* inbox.receive(
            {
              externalId: message.messageId,
              address: message.senderId,
              name: profile.name || (username === null ? "" : `@${username}`),
              phone: null,
              username,
              text: message.text
            },
            stored.settings,
            sendText(false)
          )
          if (result === "no-agent") {
            problems.set(business, "Messages arrive, but no employee answers Instagram. Choose one in Settings.")
          }
        }).pipe(inBusiness(business))

      const handle = (message: InstagramIncoming) =>
        storage.businessForAccount(message.accountId).pipe(
          Effect.flatMap(
            Option.match({ onNone: () => Effect.void, onSome: (business) => receiveIn(business, message) })
          ),
          Effect.catchCause((cause) => Effect.logWarning("An Instagram message was not handled", cause))
        )

      const renew = (business: BusinessId) =>
        Effect.gen(function* () {
          const stored = yield* storage.link
          if (stored.token === null || stored.tokenExpiresAt === null) return
          if (Date.parse(stored.tokenExpiresAt) - Date.now() > RENEW_DAYS * 24 * HOUR_MS) return
          const renewed = yield* client.refresh(stored.token)
          yield* storage.saveLink({ ...stored, token: renewed.token, tokenExpiresAt: renewed.expiresAt })
        }).pipe(
          Effect.catch((error) =>
            Effect.sync(() => {
              problems.set(business, `Instagram did not renew the access: ${error.reason}`)
            })
          ),
          inBusiness(business)
        )

      const check =
        app === null
          ? Effect.void
          : client.reachable(app.publicUrl).pipe(
              Effect.flatMap((answer) =>
                Effect.sync(() => {
                  reachable = answer
                })
              )
            )

      const status = Effect.gen(function* () {
        const business = yield* requireBusiness
        const stored = yield* storage.link
        return {
          configured: app !== null,
          publicUrl: app?.publicUrl ?? null,
          reachable,
          account: stored.token === null ? null : stored.account,
          settings: stored.settings,
          connectedAt: stored.token === null ? null : stored.connectedAt,
          problem: problems.get(business) ?? null,
          ...(yield* inbox.counts)
        } satisfies InstagramStatus
      })

      // The address is checked once on start, and tokens are renewed in the background.
      run(check)
      run(
        Effect.gen(function* () {
          while (true) {
            const businesses = yield* storage.connectedBusinesses
            yield* Effect.forEach(businesses, renew, { discard: true })
            yield* Effect.sleep(RENEW_CHECK_MS)
          }
        })
      )

      return Instagram.of({
        status,
        saveSettings: Effect.fn("Instagram.saveSettings")(function* (settings) {
          if (settings.agentId !== null) yield* agents.get(settings.agentId)
          const stored = yield* storage.link
          yield* storage.saveLink({ ...stored, settings })
          return yield* status
        }),
        login: Effect.gen(function* () {
          if (app === null) return yield* new InstagramNotConfigured()
          const { settings } = yield* storage.link
          if (settings.agentId === null) return yield* new InstagramNeedsAgent()
          yield* agents.get(settings.agentId).pipe(Effect.mapError(() => new InstagramNeedsAgent()))
          const state = randomBytes(24).toString("base64url")
          const now = Date.now()
          for (const [key, value] of logins) if (value.until < now) logins.delete(key)
          logins.set(state, { business: yield* requireBusiness, until: now + LOGIN_MS })
          return { url: authorizeUrl(app, state) }
        }),
        finishLogin: (code, state) =>
          Effect.gen(function* () {
            const login = logins.get(state)
            logins.delete(state)
            if (app === null || login === undefined || login.until < Date.now()) return "failed" as const
            return yield* Effect.gen(function* () {
              const token = yield* client.exchangeCode(app, code)
              const me = yield* client.me(token.token)
              yield* client.subscribe(token.token)
              const stored = yield* storage.link
              yield* storage.saveLink({
                ...stored,
                token: token.token,
                tokenExpiresAt: token.expiresAt,
                accountId: me.accountId,
                account: { username: me.username, name: me.name },
                connectedAt: yield* nowIso
              })
              problems.delete(login.business)
              return "connected" as const
            }).pipe(
              Effect.catch((error) =>
                Effect.sync(() => {
                  problems.set(login.business, `Instagram did not connect: ${error.reason}`)
                  return "failed" as const
                })
              ),
              inBusiness(login.business)
            )
          }),
        checkReachable: check.pipe(Effect.andThen(status)),
        disconnect: Effect.gen(function* () {
          problems.delete(yield* requireBusiness)
          const stored = yield* storage.link
          yield* storage.saveLink({ ...stored, token: null, tokenExpiresAt: null, connectedAt: null })
          return yield* status
        }),
        verifyWebhook: (mode, token, challenge) =>
          app !== null && mode === "subscribe" && token === Redacted.value(app.verifyToken)
            ? Option.some(challenge)
            : Option.none(),
        receiveWebhook: (body, signature) =>
          Effect.sync(() => {
            if (app === null || !signatureMatches(app, body, signature)) return false
            // Meta waits only a few seconds for the answer, so the messages are handled after it.
            for (const message of parseWebhook(body)) run(handle(message))
            return true
          }),
        chats: inbox.chats.pipe(
          Effect.map((chats) =>
            chats.map(
              ({ conversation, contact, lastMessage, drafts, handoff, lastCustomerAt }): InstagramChat => ({
                id: conversation.id,
                agentId: conversation.agentId,
                contactId: contact?.id ?? null,
                name: contact?.name ?? conversation.title,
                username: conversation.title.startsWith("@") ? conversation.title : "",
                lastMessage,
                drafts,
                handoff,
                lastCustomerAt
              })
            )
          )
        ),
        messages: inbox.messages,
        send: Effect.fn("Instagram.send")(function* (chatId, text) {
          yield* inbox.findChat(chatId)
          yield* requireConnected
          return yield* inbox.write(chatId, text, sendText(true))
        }),
        sendDraft: Effect.fn("Instagram.sendDraft")(function* (id, text) {
          yield* requireConnected
          return yield* inbox.sendDraft(id, text, sendText(true))
        }),
        discardDraft: inbox.discardDraft,
        resume: inbox.resume
      })
    })
  )
}
