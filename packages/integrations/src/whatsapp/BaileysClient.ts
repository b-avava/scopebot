import type * as Baileys from "@whiskeysockets/baileys"
import { Effect, Layer } from "effect"
import {
  type ClientEvent,
  type IncomingMessage,
  type SessionStore,
  WhatsAppClient,
  WhatsAppClientError
} from "./WhatsAppClient.ts"

type Library = typeof Baileys
type Logger = NonNullable<Baileys.UserFacingSocketConfig["logger"]>

/** Baileys logs a lot, and some of it holds message content. Nothing of it is kept. */
const silent: Logger = {
  level: "silent",
  child: () => silent,
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

/** These mean the phone removed the device, so retrying cannot help. */
const LINK_AGAIN = new Set([401, 403, 411])
const RESTART_REQUIRED = 515

const reasonOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

const describeMedia = (content: Baileys.proto.IMessage): string | null => {
  if (content.imageMessage) return content.imageMessage.caption || "[Photo]"
  if (content.videoMessage) return content.videoMessage.caption || "[Video]"
  if (content.audioMessage) return "[Voice message]"
  if (content.documentMessage) return content.documentMessage.caption || content.documentMessage.fileName || "[File]"
  if (content.stickerMessage) return "[Sticker]"
  if (content.locationMessage) return "[Location]"
  if (content.contactMessage || content.contactsArrayMessage) return "[Contact card]"
  return null
}

/** What a customer wrote. Reactions, edits and other protocol messages have no text and are skipped. */
const textOf = (library: Library, message: Baileys.WAMessage): string | null => {
  const content = library.normalizeMessageContent(message.message)
  if (content === undefined || content === null) return null
  const text = content.conversation || content.extendedTextMessage?.text
  return text ? text : describeMedia(content)
}

const digitsOf = (library: Library, jid: string | undefined) =>
  jid !== undefined && library.isPnUser(jid) ? (library.jidDecode(jid)?.user ?? null) : null

/** One-to-one chats only. A phone-number address is preferred, so one person keeps one chat. */
export const toIncoming = (library: Library, message: Baileys.WAMessage): IncomingMessage | null => {
  const { key } = message
  const jid = key.remoteJid ?? undefined
  if (jid === undefined || key.fromMe || key.id === undefined || key.id === null) return null
  if (!library.isPnUser(jid) && !library.isLidUser(jid)) return null
  const text = textOf(library, message)
  if (text === null) return null
  const phone = digitsOf(library, jid) ?? digitsOf(library, key.remoteJidAlt)
  const chat = library.isPnUser(jid) ? jid : phone === null ? jid : library.jidNormalizedUser(key.remoteJidAlt)
  const seconds = Number(message.messageTimestamp ?? 0)
  return {
    id: key.id,
    chat,
    phone,
    name: message.pushName ?? "",
    text,
    sentAt: new Date(seconds > 0 ? seconds * 1000 : Date.now()).toISOString()
  }
}

const authState = async (library: Library, session: SessionStore) => {
  const read = async (key: string) => {
    const text = await session.read(key)
    return text === null ? null : JSON.parse(text, library.BufferJSON.reviver)
  }
  const creds: Baileys.AuthenticationCreds = (await read("creds")) ?? library.initAuthCreds()
  const get = async (type: keyof Baileys.SignalDataTypeMap, ids: ReadonlyArray<string>) => {
    const found: Record<string, unknown> = {}
    for (const id of ids) {
      const value = await read(`${type}/${id}`)
      found[id] =
        type === "app-state-sync-key" && value !== null
          ? library.proto.Message.AppStateSyncKeyData.fromObject(value)
          : value
    }
    return found
  }
  const keys: Baileys.SignalKeyStore = {
    // The stored JSON has the shape the asked type needs; Baileys wrote it.
    get: get as Baileys.SignalKeyStore["get"],
    set: async (data) => {
      const entries: Array<readonly [string, string | null]> = []
      for (const [type, values] of Object.entries(data)) {
        for (const [id, value] of Object.entries(values ?? {})) {
          entries.push([`${type}/${id}`, value === null ? null : JSON.stringify(value, library.BufferJSON.replacer)])
        }
      }
      await session.write(entries)
    }
  }
  const saveCreds = () => session.write([["creds", JSON.stringify(creds, library.BufferJSON.replacer)]])
  return { creds, keys, saveCreds }
}

const statusOf = (error: unknown) =>
  (error as { readonly output?: { readonly statusCode?: number } } | undefined)?.output?.statusCode

const open = async (session: SessionStore, onEvent: (event: ClientEvent) => void) => {
  const library: Library = await import("@whiskeysockets/baileys")
  const { creds, keys, saveCreds } = await authState(library, session)
  const socket = library.makeWASocket({
    auth: { creds, keys: library.makeCacheableSignalKeyStore(keys, silent) },
    logger: silent,
    // A pairing code is refused for an unknown device name, so this looks like a browser.
    browser: library.Browsers.macOS("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async () => undefined
  })
  let stopped = false
  const emit = (event: ClientEvent) => {
    if (!stopped) onEvent(event)
  }

  socket.ev.on("creds.update", () => {
    void saveCreds()
  })
  socket.ev.on("connection.update", (update) => {
    if (update.qr !== undefined) emit({ _tag: "Qr", code: update.qr })
    if (update.connection === "open") {
      emit({ _tag: "Open", phone: digitsOf(library, library.jidNormalizedUser(socket.user?.id)) ?? "" })
    }
    if (update.connection === "close") {
      const status = statusOf(update.lastDisconnect?.error)
      emit({
        _tag: "Closed",
        loggedOut: status !== undefined && LINK_AGAIN.has(status),
        restart: status === RESTART_REQUIRED,
        reason: reasonOf(update.lastDisconnect?.error ?? "Connection closed")
      })
    }
  })
  socket.ev.on("messages.upsert", ({ messages, type }) => {
    // `append` is history and our own messages from other devices; only new ones get an answer.
    if (type !== "notify") return
    for (const message of messages) {
      const incoming = toIncoming(library, message)
      if (incoming !== null) emit({ _tag: "Message", message: incoming })
    }
  })

  const attempt = <A>(run: () => Promise<A>) =>
    Effect.tryPromise({ try: run, catch: (cause) => new WhatsAppClientError({ reason: reasonOf(cause) }) })

  return {
    sendText: (chat: string, text: string) =>
      attempt(() => socket.sendMessage(chat, { text })).pipe(Effect.map((sent) => sent?.key.id ?? "")),
    requestPairingCode: (phone: string) => attempt(() => socket.requestPairingCode(phone.replace(/\D/g, ""))),
    logout: attempt(async () => {
      stopped = true
      await socket.logout()
    }).pipe(Effect.ignore),
    close: Effect.sync(() => {
      stopped = true
      void socket.end(undefined)
    })
  }
}

export const BaileysClientLayer = Layer.succeed(
  WhatsAppClient,
  WhatsAppClient.of({
    connect: (session, onEvent) =>
      Effect.tryPromise({
        try: () => open(session, onEvent),
        catch: (cause) => new WhatsAppClientError({ reason: reasonOf(cause) })
      })
  })
)
