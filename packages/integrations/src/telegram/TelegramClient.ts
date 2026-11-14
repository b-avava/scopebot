import { Context, Data, Effect, Layer, Redacted } from "effect"

export class TelegramClientError extends Data.TaggedError("TelegramClientError")<{
  readonly reason: string
  /** Telegram's own code: 401 for a revoked token, 409 when someone else reads the updates. */
  readonly code: number | null
}> {}

/** A text from a person in a one-to-one chat with the bot or with a business account. */
export interface TelegramIncoming {
  /** The chat and the message together, unique for the bot. */
  readonly id: string
  readonly chatId: string
  /** Set when it came to a business account's own chat. */
  readonly businessConnectionId: string | null
  readonly fromId: string
  readonly name: string
  /** Without the @, or null. */
  readonly username: string | null
  /** Photos, voice and files come as a short description. */
  readonly text: string
}

export interface TelegramConnection {
  readonly id: string
  readonly userId: string
  readonly name: string
  readonly username: string
  /** On only while the owner keeps the bot connected and lets it reply. */
  readonly enabled: boolean
}

export type TelegramUpdate =
  | { readonly _tag: "Message"; readonly updateId: number; readonly message: TelegramIncoming }
  | { readonly _tag: "BusinessConnection"; readonly updateId: number; readonly connection: TelegramConnection }
  | { readonly _tag: "Other"; readonly updateId: number }

export interface TelegramMe {
  readonly username: string
  readonly name: string
}

/** The Telegram Bot API, the official way bots talk to Telegram. */
export class TelegramClient extends Context.Service<
  TelegramClient,
  {
    getMe(token: Redacted.Redacted<string>): Effect.Effect<TelegramMe, TelegramClientError>
    /** Waits up to the timeout for something new, so it is cheap to call in a loop. */
    getUpdates(
      token: Redacted.Redacted<string>,
      offset: number,
      timeoutSeconds: number
    ): Effect.Effect<ReadonlyArray<TelegramUpdate>, TelegramClientError>
    /** Returns the id Telegram gave the message. */
    sendMessage(
      token: Redacted.Redacted<string>,
      chatId: string,
      text: string,
      businessConnectionId: string | null
    ): Effect.Effect<string, TelegramClientError>
    /** Polling stops working while a webhook is set, so it goes first. */
    deleteWebhook(token: Redacted.Redacted<string>): Effect.Effect<void, TelegramClientError>
  }
>()("@scope-bot/integrations/TelegramClient") {}

type Raw = Record<string, unknown>

const record = (value: unknown): Raw | null => (typeof value === "object" && value !== null ? (value as Raw) : null)

const text = (value: unknown) => (typeof value === "string" ? value : "")

const nameOf = (user: Raw) => [text(user.first_name), text(user.last_name)].filter((part) => part !== "").join(" ")

const describeMedia = (message: Raw): string | null => {
  if (message.photo !== undefined) return text(message.caption) || "[Photo]"
  if (message.video !== undefined) return text(message.caption) || "[Video]"
  if (message.voice !== undefined || message.audio !== undefined) return "[Voice message]"
  if (message.document !== undefined) return text(message.caption) || "[File]"
  if (message.sticker !== undefined) return "[Sticker]"
  if (message.location !== undefined) return "[Location]"
  if (message.contact !== undefined) return "[Contact card]"
  return null
}

/** One-to-one chats with people only. Groups, channels, other bots and service messages are left out. */
const toIncoming = (raw: unknown, businessConnectionId: string | null): TelegramIncoming | null => {
  const message = record(raw)
  const chat = record(message?.chat)
  const from = record(message?.from)
  if (message === null || chat === null || from === null) return null
  if (chat.type !== "private" || from.is_bot === true) return null
  const body = text(message.text) || describeMedia(message)
  if (body === null || body === "") return null
  const chatId = String(chat.id)
  return {
    id: `${businessConnectionId ?? "bot"}:${chatId}:${String(message.message_id)}`,
    chatId,
    businessConnectionId,
    fromId: String(from.id),
    name: nameOf(from),
    username: text(from.username) || null,
    text: body
  }
}

const toConnection = (raw: Raw): TelegramConnection | null => {
  const user = record(raw.user)
  if (user === null || typeof raw.id !== "string") return null
  // `can_reply` was replaced by `rights.can_reply`; older servers still send the first.
  const rights = record(raw.rights)
  const canReply = rights === null ? raw.can_reply === true : rights.can_reply === true
  return {
    id: raw.id,
    userId: String(user.id),
    name: nameOf(user),
    username: text(user.username),
    enabled: raw.is_enabled === true && canReply
  }
}

/** Turns one update from Telegram into what Scope Bot handles. */
export const toUpdate = (raw: unknown): TelegramUpdate | null => {
  const update = record(raw)
  if (update === null || typeof update.update_id !== "number") return null
  const updateId = update.update_id
  if (update.message !== undefined) {
    const message = toIncoming(update.message, null)
    return message === null ? { _tag: "Other", updateId } : { _tag: "Message", updateId, message }
  }
  const business = record(update.business_message)
  if (business !== null) {
    const message = toIncoming(business, text(business.business_connection_id) || null)
    return message === null ? { _tag: "Other", updateId } : { _tag: "Message", updateId, message }
  }
  const connection = record(update.business_connection)
  const parsed = connection === null ? null : toConnection(connection)
  return parsed === null ? { _tag: "Other", updateId } : { _tag: "BusinessConnection", updateId, connection: parsed }
}

const API = "https://api.telegram.org"
/** Longer than the long poll itself, so only a stuck request is cut. */
const REQUEST_TIMEOUT_MS = 60_000

const call = (token: Redacted.Redacted<string>, method: string, body: Raw) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${API}/bot${Redacted.value(token)}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      })
      return (await response.json()) as { ok: boolean; result?: unknown; description?: string; error_code?: number }
    },
    // The token is part of the address, so the error never repeats the request.
    catch: () => new TelegramClientError({ reason: "Telegram could not be reached", code: null })
  }).pipe(
    Effect.flatMap((answer) =>
      answer.ok
        ? Effect.succeed(answer.result)
        : Effect.fail(
            new TelegramClientError({
              reason: answer.description ?? "Telegram refused the request",
              code: answer.error_code ?? null
            })
          )
    )
  )

export const TelegramClientLayer = Layer.succeed(
  TelegramClient,
  TelegramClient.of({
    getMe: (token) =>
      call(token, "getMe", {}).pipe(
        Effect.map((result) => {
          const me = record(result) ?? {}
          return { username: text(me.username), name: text(me.first_name) || text(me.username) }
        })
      ),
    getUpdates: (token, offset, timeoutSeconds) =>
      call(token, "getUpdates", {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ["message", "business_connection", "business_message"]
      }).pipe(
        Effect.map((result) =>
          (Array.isArray(result) ? result : []).flatMap((item) => {
            const update = toUpdate(item)
            return update === null ? [] : [update]
          })
        )
      ),
    sendMessage: (token, chatId, message, businessConnectionId) =>
      call(token, "sendMessage", {
        chat_id: chatId,
        text: message,
        ...(businessConnectionId === null ? {} : { business_connection_id: businessConnectionId })
      }).pipe(Effect.map((result) => String(record(result)?.message_id ?? ""))),
    deleteWebhook: (token) => call(token, "deleteWebhook", {}).pipe(Effect.asVoid)
  })
)
