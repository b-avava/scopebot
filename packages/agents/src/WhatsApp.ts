import { CurrentBusiness, requireBusiness, WhatsAppStorage } from "@scope-bot/db"
import {
  type AgentNotFound,
  type BusinessId,
  type ChatMessage,
  type ConversationId,
  type ConversationNotFound,
  type DraftNotFound,
  type LinkWhatsApp,
  type MessageId,
  type WhatsAppChat,
  WhatsAppNeedsAgent,
  WhatsAppNotLinked,
  WhatsAppSendFailed,
  type WhatsAppSettings,
  type WhatsAppStatus
} from "@scope-bot/domain"
import {
  type ClientEvent,
  type IncomingMessage,
  qrRows,
  type SessionStore,
  WhatsAppClient,
  type WhatsAppConnection
} from "@scope-bot/integrations"
import { Context, Effect, FiberSet, Layer, Option } from "effect"
import { Agents, nowIso } from "./Agents.ts"
import { makeInbox, type SendText } from "./ChannelInbox.ts"

const MAX_RETRY_MS = 60_000
const FIRST_RETRY_MS = 2_000

/** One linked device, kept in memory while the server runs. */
interface Live {
  readonly generation: number
  connection: WhatsAppConnection | null
  state: "linking" | "linked"
  online: boolean
  qr: string | null
  pairingPhone: string | null
  pairingCode: string | null
  problem: string | null
  retries: number
}

const digits = (text: string) => text.replace(/\D/g, "")

/** The number of a phone-number chat. Hidden numbers have none. */
const phoneOf = (address: string) => (address.endsWith("@s.whatsapp.net") ? `+${address.split("@")[0]}` : "")

/**
 * WhatsApp as a channel: one number per business, linked as a device. Every
 * chat goes to the employee chosen in the settings, and its replies wait for
 * a person until the business lets the employee answer alone.
 */
export class WhatsApp extends Context.Service<
  WhatsApp,
  {
    readonly status: Effect.Effect<WhatsAppStatus>
    saveSettings(settings: WhatsAppSettings): Effect.Effect<WhatsAppStatus, AgentNotFound>
    link(input: LinkWhatsApp): Effect.Effect<WhatsAppStatus, WhatsAppNeedsAgent | WhatsAppSendFailed>
    /** Stops linking before the phone has linked. */
    readonly cancelLink: Effect.Effect<WhatsAppStatus>
    /** Removes the device from the phone. Chats and contacts stay. */
    readonly unlink: Effect.Effect<WhatsAppStatus>
    readonly chats: Effect.Effect<ReadonlyArray<WhatsAppChat>>
    messages(chatId: ConversationId): Effect.Effect<ReadonlyArray<ChatMessage>, ConversationNotFound>
    /** A person from the team writes to the customer themselves. */
    send(
      chatId: ConversationId,
      text: string
    ): Effect.Effect<ChatMessage, ConversationNotFound | WhatsAppNotLinked | WhatsAppSendFailed>
    sendDraft(
      id: MessageId,
      text?: string
    ): Effect.Effect<ChatMessage, DraftNotFound | WhatsAppNotLinked | WhatsAppSendFailed>
    discardDraft(id: MessageId): Effect.Effect<ChatMessage, DraftNotFound>
    /** Gives a chat a person took over back to the employee. */
    resume(chatId: ConversationId): Effect.Effect<void, ConversationNotFound>
  }
>()("@scope-bot/agents/WhatsApp") {
  static readonly layer = Layer.effect(
    WhatsApp,
    Effect.gen(function* () {
      const storage = yield* WhatsAppStorage
      const client = yield* WhatsAppClient
      const agents = yield* Agents
      const inbox = yield* makeInbox("whatsapp")
      const run = yield* FiberSet.makeRuntime()

      const lives = new Map<BusinessId, Live>()
      /** Why a link ended, shown until someone links again. */
      const problems = new Map<BusinessId, string>()
      let generations = 0

      const inBusiness =
        (business: BusinessId) =>
        <A, E>(effect: Effect.Effect<A, E>) =>
          Effect.provideService(effect, CurrentBusiness, business)

      const sessionFor = (business: BusinessId): SessionStore => ({
        read: (key) =>
          Effect.runPromise(storage.readSession(key).pipe(inBusiness(business), Effect.map(Option.getOrNull))),
        write: (entries) => Effect.runPromise(storage.writeSession(entries).pipe(inBusiness(business)))
      })

      const close = (business: BusinessId) =>
        Effect.gen(function* () {
          const live = lives.get(business)
          lives.delete(business)
          if (live?.connection != null) yield* live.connection.close
        })

      const linkedConnection = (business: BusinessId) => {
        const live = lives.get(business)
        return live?.state === "linked" ? live.connection : null
      }

      const sendVia =
        (business: BusinessId): SendText<WhatsAppNotLinked | WhatsAppSendFailed> =>
        (address, text) => {
          const connection = linkedConnection(business)
          return connection === null
            ? Effect.fail(new WhatsAppNotLinked())
            : connection
                .sendText(address, text)
                .pipe(Effect.mapError((error) => new WhatsAppSendFailed({ reason: error.reason })))
        }

      /** Nothing is marked as sending while there is no connection to send it. */
      const requireLinked = Effect.gen(function* () {
        const business = yield* requireBusiness
        if (linkedConnection(business) === null) return yield* new WhatsAppNotLinked()
        return business
      })

      const receive = (business: BusinessId, message: IncomingMessage) =>
        Effect.gen(function* () {
          const { settings } = yield* storage.link
          const result = yield* inbox.receive(
            {
              externalId: message.id,
              address: message.chat,
              name: message.name,
              phone: message.phone,
              username: null,
              text: message.text
            },
            settings,
            sendVia(business)
          )
          if (result === "no-agent") {
            problems.set(business, "Messages arrive, but no employee answers WhatsApp. Choose one in Settings.")
          }
        }).pipe(inBusiness(business))

      const linked = (business: BusinessId, live: Live, phone: string) =>
        Effect.gen(function* () {
          live.state = "linked"
          live.online = true
          live.qr = null
          live.pairingCode = null
          live.pairingPhone = null
          live.retries = 0
          problems.delete(business)
          const stored = yield* storage.link
          yield* storage.saveLink({
            ...stored,
            phone: phone === "" ? (stored.phone ?? "") : `+${phone}`,
            linkedAt: stored.linkedAt ?? (yield* nowIso)
          })
        }).pipe(inBusiness(business))

      const forget = (business: BusinessId, problem: string | null) =>
        Effect.gen(function* () {
          yield* close(business)
          yield* storage.clearSession
          const stored = yield* storage.link
          yield* storage.saveLink({ ...stored, phone: null, linkedAt: null })
          if (problem === null) problems.delete(business)
          else problems.set(business, problem)
        }).pipe(inBusiness(business))

      // A code for typing on the phone is asked for once WhatsApp is ready to give one.
      const onQr = (live: Live, code: string) =>
        Effect.gen(function* () {
          live.qr = code
          const { connection, pairingPhone } = live
          if (connection === null || pairingPhone === null || live.pairingCode !== null) return
          live.pairingCode = yield* connection.requestPairingCode(pairingPhone).pipe(
            Effect.catch(() => {
              live.problem = "WhatsApp did not give a code for this number. Check it, or use the QR code."
              return Effect.succeed(null)
            })
          )
        })

      const onMessage = (business: BusinessId, live: Live, message: IncomingMessage) =>
        live.state !== "linked"
          ? Effect.void
          : receive(business, message).pipe(
              Effect.catchCause((cause) => Effect.logWarning("A WhatsApp message was not handled", cause))
            )

      const onEvent = (business: BusinessId, generation: number, event: ClientEvent): Effect.Effect<void> => {
        const live = lives.get(business)
        if (live === undefined || live.generation !== generation) return Effect.void
        switch (event._tag) {
          case "Qr":
            return onQr(live, event.code)
          case "Open":
            return linked(business, live, event.phone)
          case "Closed":
            return closed(business, live, event)
          case "Message":
            return onMessage(business, live, event.message)
        }
      }

      const retry = (business: BusinessId, live: Live, now: boolean) =>
        Effect.gen(function* () {
          const delay = now ? 0 : Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** live.retries)
          live.retries += 1
          yield* Effect.sleep(delay)
          // Someone may have unlinked or linked again meanwhile.
          if (lives.get(business) !== live) return
          yield* connect(business, live.state, live.pairingPhone, live.retries).pipe(Effect.ignore)
        })

      const closed = (business: BusinessId, live: Live, event: Extract<ClientEvent, { _tag: "Closed" }>) =>
        Effect.gen(function* () {
          live.online = false
          if (event.loggedOut) {
            return yield* forget(
              business,
              live.state === "linking" ? null : "The phone removed Scope Bot from its linked devices. Link it again."
            )
          }
          // A code nobody scans expires; linking starts again only when someone asks.
          if (live.state === "linking" && !event.restart) {
            yield* close(business)
            problems.set(business, "Nobody scanned the code in time. Start again when the phone is at hand.")
            return
          }
          yield* retry(business, live, event.restart)
        })

      const connect = (
        business: BusinessId,
        state: Live["state"],
        pairingPhone: string | null,
        retries = 0
      ): Effect.Effect<void, WhatsAppSendFailed> =>
        Effect.gen(function* () {
          generations += 1
          const generation = generations
          const live: Live = {
            generation,
            connection: null,
            state,
            online: false,
            qr: null,
            pairingPhone,
            pairingCode: null,
            problem: null,
            retries
          }
          lives.set(business, live)
          const connection = yield* client
            .connect(sessionFor(business), (event) => {
              run(onEvent(business, generation, event))
            })
            .pipe(
              Effect.tapError(() =>
                Effect.sync(() => {
                  if (lives.get(business) === live) lives.delete(business)
                })
              ),
              Effect.mapError((error) => new WhatsAppSendFailed({ reason: error.reason }))
            )
          if (lives.get(business) === live) live.connection = connection
          else yield* connection.close
        })

      const status = Effect.gen(function* () {
        const business = yield* requireBusiness
        const stored = yield* storage.link
        const live = lives.get(business)
        const counts = yield* inbox.counts
        const linking = live?.state === "linking"
        return {
          state: live?.state ?? (stored.phone === null ? "unlinked" : "linked"),
          settings: stored.settings,
          phone: stored.phone,
          linkedAt: stored.linkedAt,
          online: live?.online ?? false,
          qr: linking && live.qr !== null && live.pairingPhone === null ? qrRows(live.qr) : null,
          pairingCode: linking ? live.pairingCode : null,
          problem: live?.problem ?? problems.get(business) ?? null,
          ...counts
        } satisfies WhatsAppStatus
      })

      // Numbers linked before the server stopped come back on their own.
      run(
        storage.linkedBusinesses.pipe(
          Effect.flatMap((businesses) =>
            Effect.forEach(businesses, (business) =>
              connect(business, "linked", null).pipe(
                Effect.catch((error) =>
                  Effect.sync(() => {
                    problems.set(business, `Could not reach WhatsApp: ${error.reason}`)
                  })
                )
              )
            )
          )
        )
      )

      yield* Effect.addFinalizer(() => Effect.forEach([...lives.keys()], close, { discard: true }).pipe(Effect.ignore))

      return WhatsApp.of({
        status,
        saveSettings: Effect.fn("WhatsApp.saveSettings")(function* (settings) {
          if (settings.agentId !== null) yield* agents.get(settings.agentId)
          const stored = yield* storage.link
          yield* storage.saveLink({ ...stored, settings })
          return yield* status
        }),
        link: Effect.fn("WhatsApp.link")(function* (input) {
          const business = yield* requireBusiness
          const { settings } = yield* storage.link
          if (settings.agentId === null) return yield* new WhatsAppNeedsAgent()
          yield* agents.get(settings.agentId).pipe(Effect.mapError(() => new WhatsAppNeedsAgent()))
          if (lives.get(business)?.state === "linked") return yield* status
          yield* close(business)
          yield* storage.clearSession
          problems.delete(business)
          const phone = input.phone === undefined ? null : digits(input.phone)
          yield* connect(business, "linking", phone)
          return yield* status
        }),
        cancelLink: Effect.gen(function* () {
          const business = yield* requireBusiness
          if (lives.get(business)?.state === "linking") {
            yield* close(business)
            yield* storage.clearSession
          }
          return yield* status
        }),
        unlink: Effect.gen(function* () {
          const business = yield* requireBusiness
          const connection = lives.get(business)?.connection
          lives.delete(business)
          if (connection != null) yield* connection.logout
          yield* forget(business, null)
          return yield* status
        }),
        chats: inbox.chats.pipe(
          Effect.map((chats) =>
            chats.map(
              ({ conversation, contact, lastMessage, drafts, handoff }): WhatsAppChat => ({
                id: conversation.id,
                agentId: conversation.agentId,
                contactId: contact?.id ?? null,
                name: contact?.name ?? conversation.title,
                phone: phoneOf(conversation.address ?? ""),
                lastMessage,
                drafts,
                handoff
              })
            )
          )
        ),
        messages: inbox.messages,
        send: Effect.fn("WhatsApp.send")(function* (chatId, text) {
          yield* inbox.findChat(chatId)
          const business = yield* requireLinked
          return yield* inbox.write(chatId, text, sendVia(business))
        }),
        sendDraft: Effect.fn("WhatsApp.sendDraft")(function* (id, text) {
          const business = yield* requireLinked
          return yield* inbox.sendDraft(id, text, sendVia(business))
        }),
        discardDraft: inbox.discardDraft,
        resume: inbox.resume
      })
    })
  )
}
