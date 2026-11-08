import { createHmac, timingSafeEqual } from "node:crypto"
import { Context, Data, Effect, Layer, Redacted } from "effect"

/** The Meta app this server connects Instagram accounts through. One for the whole server. */
export interface InstagramApp {
  readonly appId: string
  readonly appSecret: Redacted.Redacted<string>
  /** Where Instagram reaches this server, without a trailing slash. */
  readonly publicUrl: string
  /** What Meta repeats when it checks the webhook address. */
  readonly verifyToken: Redacted.Redacted<string>
}

/** The server's Meta app, or null when none is set up. */
export class InstagramSetup extends Context.Service<InstagramSetup, { readonly app: InstagramApp | null }>()(
  "@scope-bot/integrations/InstagramSetup"
) {}

export class InstagramClientError extends Data.TaggedError("InstagramClientError")<{
  readonly reason: string
  /** Meta's own code: 190 for a token that no longer works. */
  readonly code: number | null
}> {}

export interface InstagramToken {
  readonly token: Redacted.Redacted<string>
  readonly expiresAt: string
}

export interface InstagramMe {
  /** The professional account's id, as webhooks name it. */
  readonly accountId: string
  readonly username: string
  readonly name: string
}

/** A message from a person to the account. Echoes of the account's own messages never get here. */
export interface InstagramIncoming {
  readonly accountId: string
  readonly senderId: string
  readonly messageId: string
  readonly text: string
  readonly storyReply: boolean
}

export const redirectPath = "/instagram/oauth/callback"
export const webhookPath = "/instagram/webhook"

/** Business Login for Instagram: the person signs in and allows reading and sending messages. */
export const authorizeUrl = (app: InstagramApp, state: string) => {
  const url = new URL("https://www.instagram.com/oauth/authorize")
  url.searchParams.set("client_id", app.appId)
  url.searchParams.set("redirect_uri", `${app.publicUrl}${redirectPath}`)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages")
  url.searchParams.set("state", state)
  return url.toString()
}

/** Meta signs every webhook with the app secret. Anything else is not from Instagram. */
export const signatureMatches = (app: InstagramApp, body: string, header: string | undefined) => {
  if (header === undefined || !header.startsWith("sha256=")) return false
  const expected = createHmac("sha256", Redacted.value(app.appSecret)).update(body).digest()
  const given = Buffer.from(header.slice("sha256=".length), "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

type Raw = Record<string, unknown>
const record = (value: unknown): Raw | null => (typeof value === "object" && value !== null ? (value as Raw) : null)
const list = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : [])
const text = (value: unknown) => (typeof value === "string" ? value : "")

const describeAttachments = (attachments: ReadonlyArray<unknown>) => {
  const type = text(record(attachments[0])?.type)
  if (type === "") return null
  const names: Record<string, string> = {
    image: "[Photo]",
    video: "[Video]",
    audio: "[Voice message]",
    file: "[File]",
    share: "[Shared post]",
    story_mention: "[Mentioned you in a story]",
    ig_reel: "[Reel]"
  }
  return names[type] ?? "[Attachment]"
}

const toIncoming = (accountId: string, event: Raw): InstagramIncoming | null => {
  const message = record(event.message)
  const sender = text(record(event.sender)?.id)
  if (message === null || sender === "" || sender === accountId) return null
  // Echoes are the account's own messages, sent from Scope Bot or the Instagram app.
  if (message.is_echo === true || message.is_deleted === true) return null
  const messageId = text(message.mid)
  if (messageId === "") return null
  const storyReply = record(record(message.reply_to)?.story) !== null
  const body = text(message.text) || describeAttachments(list(message.attachments))
  return {
    accountId,
    senderId: sender,
    messageId,
    text: body ?? (storyReply ? "[Replied to your story]" : ""),
    storyReply
  }
}

/** The messages in one webhook call. Reactions, reads and other events are left out. */
export const parseWebhook = (body: string): ReadonlyArray<InstagramIncoming> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }
  const root = record(parsed)
  if (root === null || root.object !== "instagram") return []
  return list(root.entry).flatMap((entry) => {
    const item = record(entry)
    const accountId = text(item?.id)
    return list(item?.messaging).flatMap((event) => {
      const incoming = record(event) === null ? null : toIncoming(accountId, record(event) as Raw)
      return incoming === null || incoming.text === "" ? [] : [incoming]
    })
  })
}

/** The Instagram API with Instagram Login, the official way to answer Direct messages. */
export class InstagramClient extends Context.Service<
  InstagramClient,
  {
    /** Turns the code from the login into a token that lasts 60 days. */
    exchangeCode(app: InstagramApp, code: string): Effect.Effect<InstagramToken, InstagramClientError>
    refresh(token: Redacted.Redacted<string>): Effect.Effect<InstagramToken, InstagramClientError>
    me(token: Redacted.Redacted<string>): Effect.Effect<InstagramMe, InstagramClientError>
    /** Asks Instagram to send this account's messages to the app's webhook. */
    subscribe(token: Redacted.Redacted<string>): Effect.Effect<void, InstagramClientError>
    /** The sender's name and username, when Instagram shares them. */
    profile(
      token: Redacted.Redacted<string>,
      userId: string
    ): Effect.Effect<{ readonly name: string; readonly username: string }, InstagramClientError>
    /** A person may answer later than the business can; that needs the human agent tag. */
    sendText(
      token: Redacted.Redacted<string>,
      recipientId: string,
      text: string,
      byPerson: boolean
    ): Effect.Effect<string, InstagramClientError>
    /** Whether the public address answers, as Instagram would try it. */
    reachable(publicUrl: string): Effect.Effect<boolean>
  }
>()("@scope-bot/integrations/InstagramClient") {}

const GRAPH = "https://graph.instagram.com/v23.0"
const REQUEST_TIMEOUT_MS = 20_000

type Answer = { readonly error?: { readonly message?: string; readonly code?: number } } & Raw

const request = (input: string, init: RequestInit = {}) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      })
      return (await response.json()) as Answer
    },
    // Tokens can be part of the address, so the error never repeats the request.
    catch: () => new InstagramClientError({ reason: "Instagram could not be reached", code: null })
  }).pipe(
    Effect.flatMap((answer) =>
      answer.error === undefined
        ? Effect.succeed(answer)
        : Effect.fail(
            new InstagramClientError({
              reason: answer.error.message ?? "Instagram refused the request",
              code: answer.error.code ?? null
            })
          )
    )
  )

const withToken = (token: Redacted.Redacted<string>) => ({ authorization: `Bearer ${Redacted.value(token)}` })

const longLived = (answer: Answer): InstagramToken => ({
  token: Redacted.make(text(answer.access_token)),
  expiresAt: new Date(Date.now() + Number(answer.expires_in ?? 0) * 1000).toISOString()
})

export const InstagramClientLayer = Layer.succeed(
  InstagramClient,
  InstagramClient.of({
    exchangeCode: (app, code) =>
      Effect.gen(function* () {
        const form = new URLSearchParams({
          client_id: app.appId,
          client_secret: Redacted.value(app.appSecret),
          grant_type: "authorization_code",
          redirect_uri: `${app.publicUrl}${redirectPath}`,
          code
        })
        const short = yield* request("https://api.instagram.com/oauth/access_token", { method: "POST", body: form })
        const exchange = new URL("https://graph.instagram.com/access_token")
        exchange.searchParams.set("grant_type", "ig_exchange_token")
        exchange.searchParams.set("client_secret", Redacted.value(app.appSecret))
        exchange.searchParams.set("access_token", text(short.access_token))
        return longLived(yield* request(exchange.toString()))
      }),
    refresh: (token) =>
      request("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token", {
        headers: withToken(token)
      }).pipe(Effect.map(longLived)),
    me: (token) =>
      request(`${GRAPH}/me?fields=user_id,username,name`, { headers: withToken(token) }).pipe(
        Effect.map((me) => ({
          accountId: String(me.user_id ?? ""),
          username: text(me.username),
          name: text(me.name) || text(me.username)
        }))
      ),
    subscribe: (token) =>
      request(`${GRAPH}/me/subscribed_apps?subscribed_fields=messages`, {
        method: "POST",
        headers: withToken(token)
      }).pipe(Effect.asVoid),
    profile: (token, userId) =>
      request(`${GRAPH}/${encodeURIComponent(userId)}?fields=name,username`, { headers: withToken(token) }).pipe(
        Effect.map((user) => ({ name: text(user.name), username: text(user.username) }))
      ),
    sendText: (token, recipientId, message, byPerson) =>
      request(`${GRAPH}/me/messages`, {
        method: "POST",
        headers: { ...withToken(token), "content-type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          ...(byPerson ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {})
        })
      }).pipe(Effect.map((sent) => text(sent.message_id))),
    reachable: (publicUrl) =>
      Effect.tryPromise({
        try: (signal) =>
          fetch(`${publicUrl}/health`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) }),
        catch: () => false
      }).pipe(
        Effect.map((response) => response.ok),
        Effect.catch(() => Effect.succeed(false))
      )
  })
)
