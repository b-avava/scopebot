import { CurrentBusiness, requireBusiness, type StoredTelegram, TelegramStorage } from "@scope-bot/db"
import {
  type AgentNotFound,
  type BusinessId,
  type ChannelSettings,
  type ChatMessage,
  type ConnectTelegram,
  type ConversationId,
  type ConversationNotFound,
  type DraftNotFound,
  type MessageId,
  type TelegramChat,
  TelegramNeedsAgent,
  TelegramNotConnected,
  TelegramSendFailed,
  type TelegramStatus,
  TelegramTokenInvalid
} from "@scope-bot/domain"
import {
  TelegramClient,
  type TelegramClientError,
  type TelegramConnection,
  type TelegramIncoming,
  type TelegramUpdate
} from "@scope-bot/integrations"
import { Context, Effect, Fiber, FiberSet, Layer, Redacted } from "effect"
import { Agents, nowIso } from "./Agents.ts"
import { makeInbox, type SendText } from "./ChannelInbox.ts"

/** Telegram holds a request open this long while nothing happens. */
const POLL_SECONDS = 25
const MAX_RETRY_MS = 60_000
const FIRST_RETRY_MS = 2_000

/** The listening bot of one business, kept in memory while the server runs. */
interface Live {
  readonly fiber: Fiber.Fiber<void>
  online: boolean
  problem: string | null
}

/** Where to answer: the bot's own chat, or a chat of the business account. */
const addressOf = (message: TelegramIncoming) =>
  message.businessConnectionId === null
    ? `bot:${message.chatId}`
    : `business:${message.businessConnectionId}:${message.chatId}`

const parseAddress = (address: string) => {
  const [kind, first = "", second = ""] = address.split(":")
  return kind === "business" ? { connectionId: first, chatId: second } : { connectionId: null, chatId: first }
}

const unauthorized = (error: TelegramClientError) => error.code === 401 || error.code === 404

/**
 * Telegram as a channel, through the official Bot API: customers write to the
 * business's bot, and with Telegram Business also to the business's own
 * account. Every chat goes to one employee, and replies wait for a person
 * until the business lets the employee answer alone.
 */
export class Telegram extends Context.Service<
  Telegram,
  {
    readonly status: Effect.Effect<TelegramStatus>
    saveSettings(settings: ChannelSettings): Effect.Effect<TelegramStatus, AgentNotFound>
    connect(
      input: ConnectTelegram
    ): Effect.Effect<TelegramStatus, TelegramTokenInvalid | TelegramNeedsAgent | TelegramSendFailed>
    /** Stops listening and forgets the token. Chats and contacts stay. */
    readonly disconnect: Effect.Effect<TelegramStatus>
    readonly chats: Effect.Effect<ReadonlyArray<TelegramChat>>
    messages(chatId: ConversationId): Effect.Effect<ReadonlyArray<ChatMessage>, ConversationNotFound>
    send(
      chatId: ConversationId,
      text: string
    ): Effect.Effect<ChatMessage, ConversationNotFound | TelegramNotConnected | TelegramSendFailed>
    sendDraft(
      id: MessageId,
      text?: string
    ): Effect.Effect<ChatMessage, DraftNotFound | TelegramNotConnected | TelegramSendFailed>
    discardDraft(id: MessageId): Effect.Effect<ChatMessage, DraftNotFound>
  }
>()("@scope-bot/agents/Telegram") {
  static readonly layer = Layer.effect(
    Telegram,
    Effect.gen(function* () {
      const storage = yield* TelegramStorage
      const client = yield* TelegramClient
      const agents = yield* Agents
      const inbox = yield* makeInbox("telegram")
      const run = yield* FiberSet.makeRuntime()

      const lives = new Map<BusinessId, Live>()
      /** Why the bot stopped, shown until it is connected again. */
      const problems = new Map<BusinessId, string>()

      const inBusiness =
        (business: BusinessId) =>
        <A, E>(effect: Effect.Effect<A, E>) =>
          Effect.provideService(effect, CurrentBusiness, business)

      const sendText: SendText<TelegramNotConnected | TelegramSendFailed> = (address, text) =>
        Effect.gen(function* () {
          const { token, business } = yield* storage.link
          if (token === null) return yield* new TelegramNotConnected()
          const { connectionId, chatId } = parseAddress(address)
          // A business chat can only be answered while the owner lets the bot reply.
          if (connectionId !== null && (business?.connectionId !== connectionId || !business.enabled)) {
            return yield* new TelegramSendFailed({ reason: "The business account no longer lets the bot reply." })
          }
          return yield* client
            .sendMessage(token, chatId, text, connectionId)
            .pipe(Effect.mapError((error) => new TelegramSendFailed({ reason: error.reason })))
        })

      const requireConnected = storage.link.pipe(
        Effect.flatMap((link) => (link.token === null ? Effect.fail(new TelegramNotConnected()) : Effect.void))
      )

      const onConnection = (connection: TelegramConnection) =>
        Effect.gen(function* () {
          const stored = yield* storage.link
          yield* storage.saveLink({
            ...stored,
            business: {
              connectionId: connection.id,
              userId: connection.userId,
              name: connection.name,
              username: connection.username,
              enabled: connection.enabled
            }
          })
        })

      const onMessage = (business: BusinessId, message: TelegramIncoming) =>
        Effect.gen(function* () {
          const stored = yield* storage.link
          if (message.businessConnectionId !== null) {
            const account = stored.business
            // The owner's own messages in those chats are theirs, not the customer's.
            if (account === null || account.connectionId !== message.businessConnectionId || !account.enabled) return
            if (message.fromId === account.userId) return
          }
          const result = yield* inbox.receive(
            {
              externalId: message.id,
              address: addressOf(message),
              name: message.name,
              phone: null,
              username: message.username,
              text: message.text
            },
            stored.settings,
            sendText
          )
          if (result === "no-agent") {
            problems.set(business, "Messages arrive, but no employee answers Telegram. Choose one in Settings.")
          }
        })

      const handle = (business: BusinessId, update: TelegramUpdate) => {
        switch (update._tag) {
          case "Message":
            return onMessage(business, update.message)
          case "BusinessConnection":
            return onConnection(update.connection)
          case "Other":
            return Effect.void
        }
      }

      /** Handles a batch, and only then moves the offset, so a crash repeats rather than loses. */
      const handleBatch = (business: BusinessId, updates: ReadonlyArray<TelegramUpdate>) =>
        Effect.gen(function* () {
          for (const update of updates) {
            yield* handle(business, update).pipe(
              Effect.catchCause((cause) => Effect.logWarning("A Telegram update was not handled", cause))
            )
          }
          const last = updates.at(-1)
          if (last === undefined) return
          const latest = yield* storage.link
          yield* storage.saveLink({ ...latest, offset: last.updateId + 1 })
        })

      const setOnline = (live: Live | undefined, online: boolean) =>
        Effect.sync(() => {
          if (live !== undefined) live.online = online
        })

      /** Stops for good on a revoked token, and waits a little longer each time otherwise. */
      const failed = (
        business: BusinessId,
        token: Redacted.Redacted<string>,
        error: TelegramClientError,
        retries: number
      ) =>
        Effect.gen(function* () {
          if (unauthorized(error)) {
            problems.set(business, "Telegram no longer accepts the bot's token. Connect it again with a new one.")
            return "stop" as const
          }
          // Someone else reads the updates, usually a webhook left by another tool.
          if (error.code === 409) yield* client.deleteWebhook(token).pipe(Effect.ignore)
          yield* Effect.sleep(Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** retries))
          return "retry" as const
        })

      const pollOnce = (business: BusinessId, live: () => Live | undefined, retries: number) =>
        Effect.gen(function* () {
          const stored = yield* storage.link
          const token = stored.token
          if (token === null) return "stop" as const
          return yield* client.getUpdates(token, stored.offset, POLL_SECONDS).pipe(
            Effect.tap(() => setOnline(live(), true)),
            Effect.flatMap((list) => handleBatch(business, list)),
            Effect.as("ok" as const),
            Effect.catch((error) =>
              setOnline(live(), false).pipe(Effect.andThen(failed(business, token, error, retries)))
            )
          )
        })

      const poll = (business: BusinessId, live: () => Live | undefined) =>
        Effect.gen(function* () {
          let retries = 0
          while (true) {
            const result = yield* pollOnce(business, live, retries)
            if (result === "stop") return
            retries = result === "ok" ? 0 : retries + 1
          }
        }).pipe(inBusiness(business))

      const stop = (business: BusinessId) =>
        Effect.gen(function* () {
          const live = lives.get(business)
          lives.delete(business)
          if (live !== undefined) yield* Fiber.interrupt(live.fiber)
        })

      const start = (business: BusinessId) =>
        Effect.gen(function* () {
          yield* stop(business)
          problems.delete(business)
          let live: Live | undefined
          const fiber = run(poll(business, () => live))
          live = { fiber, online: false, problem: null }
          lives.set(business, live)
        })

      const status = Effect.gen(function* () {
        const business = yield* requireBusiness
        const stored: StoredTelegram = yield* storage.link
        const live = lives.get(business)
        const account = stored.business
        return {
          bot: stored.token === null ? null : stored.bot,
          settings: stored.settings,
          connectedAt: stored.token === null ? null : stored.connectedAt,
          business:
            account === null || stored.token === null
              ? null
              : { name: account.name, username: account.username, enabled: account.enabled },
          online: live?.online ?? false,
          problem: live?.problem ?? problems.get(business) ?? null,
          ...(yield* inbox.counts)
        } satisfies TelegramStatus
      })

      // Bots connected before the server stopped start listening again.
      run(
        storage.connectedBusinesses.pipe(
          Effect.flatMap((businesses) => Effect.forEach(businesses, start, { discard: true }))
        )
      )

      yield* Effect.addFinalizer(() => Effect.forEach([...lives.keys()], stop, { discard: true }))

      return Telegram.of({
        status,
        saveSettings: Effect.fn("Telegram.saveSettings")(function* (settings) {
          if (settings.agentId !== null) yield* agents.get(settings.agentId)
          const stored = yield* storage.link
          yield* storage.saveLink({ ...stored, settings })
          return yield* status
        }),
        connect: Effect.fn("Telegram.connect")(function* (input) {
          const business = yield* requireBusiness
          const stored = yield* storage.link
          if (stored.settings.agentId === null) return yield* new TelegramNeedsAgent()
          yield* agents.get(stored.settings.agentId).pipe(Effect.mapError(() => new TelegramNeedsAgent()))
          const token = Redacted.make(input.token.trim())
          const bot = yield* client
            .getMe(token)
            .pipe(
              Effect.mapError((error) =>
                unauthorized(error) ? new TelegramTokenInvalid() : new TelegramSendFailed({ reason: error.reason })
              )
            )
          yield* client.deleteWebhook(token).pipe(Effect.ignore)
          // A different bot starts from its own first update.
          const sameBot = stored.bot?.username === bot.username
          yield* storage.saveLink({
            ...stored,
            token,
            bot,
            connectedAt: yield* nowIso,
            offset: sameBot ? stored.offset : 0,
            business: sameBot ? stored.business : null
          })
          yield* start(business)
          return yield* status
        }),
        disconnect: Effect.gen(function* () {
          const business = yield* requireBusiness
          yield* stop(business)
          problems.delete(business)
          const stored = yield* storage.link
          yield* storage.saveLink({ ...stored, token: null, connectedAt: null })
          return yield* status
        }),
        chats: inbox.chats.pipe(
          Effect.map((chats) =>
            chats.map(
              ({ conversation, contact, lastMessage, drafts }): TelegramChat => ({
                id: conversation.id,
                agentId: conversation.agentId,
                contactId: contact?.id ?? null,
                name: contact?.name ?? conversation.title,
                username: contact?.channels.telegram ?? (conversation.title.startsWith("@") ? conversation.title : ""),
                via: (conversation.address ?? "").startsWith("business:") ? "business" : "bot",
                lastMessage,
                drafts
              })
            )
          )
        ),
        messages: inbox.messages,
        send: Effect.fn("Telegram.send")(function* (chatId, text) {
          yield* inbox.findChat(chatId)
          yield* requireConnected
          return yield* inbox.write(chatId, text, sendText)
        }),
        sendDraft: Effect.fn("Telegram.sendDraft")(function* (id, text) {
          yield* requireConnected
          return yield* inbox.sendDraft(id, text, sendText)
        }),
        discardDraft: inbox.discardDraft
      })
    })
  )
}
