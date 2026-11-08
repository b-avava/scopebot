import { Effect, Layer, Redacted } from "effect"
import {
  TelegramClient,
  TelegramClientError,
  type TelegramIncoming,
  type TelegramUpdate
} from "./telegram/TelegramClient.ts"
import {
  type ClientEvent,
  type IncomingMessage,
  type SessionStore,
  WhatsAppClient,
  WhatsAppClientError
} from "./whatsapp/WhatsAppClient.ts"

/**
 * WhatsApp without a network, for tests. It behaves like the real one where
 * it matters: a new device shows a QR code, a stored session reconnects
 * without one, and the phone can link, write or remove the device.
 */
export const makeFakeWhatsApp = () => {
  let current: { readonly session: SessionStore; readonly emit: (event: ClientEvent) => void } | null = null
  const sent: Array<{ readonly chat: string; readonly text: string }> = []
  const pairingRequests: Array<string> = []
  let connections = 0
  let failSending = false

  const active = () => {
    if (current === null) throw new Error("Nothing is connected")
    return current
  }

  const layer = Layer.succeed(
    WhatsAppClient,
    WhatsAppClient.of({
      connect: (session, onEvent) =>
        Effect.promise(async () => {
          connections += 1
          let stopped = false
          const emit = (event: ClientEvent) => {
            if (!stopped) onEvent(event)
          }
          current = { session, emit }
          const linkedPhone = await session.read("creds")
          // Events come after connect returns, as they do from a real socket.
          setTimeout(() => {
            emit(
              linkedPhone === null ? { _tag: "Qr", code: `qr-${connections}` } : { _tag: "Open", phone: linkedPhone }
            )
          }, 0)
          return {
            sendText: (chat, text) =>
              failSending
                ? Effect.fail(new WhatsAppClientError({ reason: "Not delivered" }))
                : Effect.sync(() => {
                    sent.push({ chat, text })
                    return `sent-${sent.length}`
                  }),
            requestPairingCode: (phone) =>
              Effect.sync(() => {
                pairingRequests.push(phone)
                return "ABCD-1234"
              }),
            logout: Effect.sync(() => {
              stopped = true
            }),
            close: Effect.sync(() => {
              stopped = true
            })
          }
        })
    })
  )

  return {
    layer,
    sent,
    pairingRequests,
    connections: () => connections,
    failSending: (fail: boolean) => {
      failSending = fail
    },
    /** The phone scans the code: the session is saved and the device opens. */
    link: async (phone: string) => {
      const { session, emit } = active()
      await session.write([["creds", phone]])
      emit({ _tag: "Open", phone })
    },
    receive: (message: Partial<IncomingMessage> & Pick<IncomingMessage, "text">) =>
      active().emit({
        _tag: "Message",
        message: {
          id: crypto.randomUUID(),
          chat: "995577204518@s.whatsapp.net",
          phone: "995577204518",
          name: "Anna",
          sentAt: new Date().toISOString(),
          ...message
        }
      }),
    /** The phone removes the device from its linked devices. */
    removeDevice: () => active().emit({ _tag: "Closed", loggedOut: true, restart: false, reason: "logged out" }),
    drop: () => active().emit({ _tag: "Closed", loggedOut: false, restart: false, reason: "Connection lost" })
  }
}

/**
 * The Telegram Bot API without a network, for tests. Updates wait in a queue
 * until the bot asks for them, as they do on Telegram.
 */
export const makeFakeTelegram = (validToken = "123456:abcdefghijklmnopqrstuvwxyz0123456789") => {
  const queue: Array<TelegramUpdate> = []
  const sent: Array<{ readonly chatId: string; readonly text: string; readonly businessConnectionId: string | null }> =
    []
  let nextUpdate = 1
  let nextMessage = 1
  let revoked = false
  let polls = 0

  const check = (token: Redacted.Redacted<string>): Effect.Effect<void, TelegramClientError> =>
    revoked || Redacted.value(token) !== validToken
      ? Effect.fail(new TelegramClientError({ reason: "Unauthorized", code: 401 }))
      : Effect.void

  const layer = Layer.succeed(
    TelegramClient,
    TelegramClient.of({
      getMe: (token) => check(token).pipe(Effect.as({ username: "northwind_bot", name: "Northwind" })),
      getUpdates: (token, offset) =>
        check(token).pipe(
          // A short wait stands in for the long poll, so a loop does not spin.
          Effect.andThen(Effect.sleep(15)),
          Effect.map(() => {
            polls += 1
            return queue.filter((update) => update.updateId >= offset)
          })
        ),
      sendMessage: (token, chatId, text, businessConnectionId) =>
        check(token).pipe(
          Effect.map(() => {
            sent.push({ chatId, text, businessConnectionId })
            return String(1000 + sent.length)
          })
        ),
      deleteWebhook: (token) => check(token)
    })
  )

  const push = (update: (updateId: number) => TelegramUpdate) => {
    queue.push(update(nextUpdate))
    nextUpdate += 1
  }

  return {
    layer,
    validToken,
    sent,
    polls: () => polls,
    receive: (message: Partial<TelegramIncoming> & Pick<TelegramIncoming, "text">) => {
      const chatId = message.chatId ?? "5001"
      const id = `${message.businessConnectionId ?? "bot"}:${chatId}:${nextMessage++}`
      push((updateId) => ({
        _tag: "Message",
        updateId,
        message: {
          id,
          chatId,
          businessConnectionId: null,
          fromId: chatId,
          name: "Anna Kiknadze",
          username: "anna_k",
          ...message
        }
      }))
    },
    connectBusiness: (enabled = true) =>
      push((updateId) => ({
        _tag: "BusinessConnection",
        updateId,
        connection: { id: "biz-1", userId: "777", name: "Northwind Studio", username: "northwind", enabled }
      })),
    revoke: () => {
      revoked = true
    }
  }
}
