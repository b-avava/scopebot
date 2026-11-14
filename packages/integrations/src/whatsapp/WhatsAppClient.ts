import { Context, Data, type Effect } from "effect"

/** Where the linked device keeps its keys. Values are JSON text. */
export interface SessionStore {
  read(key: string): Promise<string | null>
  /** A null value removes the key. */
  write(entries: ReadonlyArray<readonly [key: string, value: string | null]>): Promise<void>
}

/** A text from a customer in a one-to-one chat. Groups, statuses and channels never get here. */
export interface IncomingMessage {
  /** The id WhatsApp gave the message. */
  readonly id: string
  /** Where to answer. */
  readonly chat: string
  /** Digits with the country code, or null when WhatsApp hides the number. */
  readonly phone: string | null
  /** The name the customer set in WhatsApp. Empty when there is none. */
  readonly name: string
  /** What they wrote. Photos, voice and files come as a short description. */
  readonly text: string
  readonly sentAt: string
}

export type ClientEvent =
  /** A new QR code to scan. It changes about every 20 seconds until the phone links. */
  | { readonly _tag: "Qr"; readonly code: string }
  | { readonly _tag: "Open"; readonly phone: string }
  /**
   * The connection ended. Logged out means the phone removed the device, so it
   * has to be linked again. Restart means WhatsApp asks for a new connection
   * right away, which it does once the phone has linked.
   */
  | { readonly _tag: "Closed"; readonly loggedOut: boolean; readonly restart: boolean; readonly reason: string }
  | { readonly _tag: "Message"; readonly message: IncomingMessage }

export class WhatsAppClientError extends Data.TaggedError("WhatsAppClientError")<{ readonly reason: string }> {}

export interface WhatsAppConnection {
  /** Returns the id WhatsApp gave the sent message. */
  sendText(chat: string, text: string): Effect.Effect<string, WhatsAppClientError>
  /** For linking without a camera: the code to type on the phone. */
  requestPairingCode(phone: string): Effect.Effect<string, WhatsAppClientError>
  /** Removes the device from the phone's linked devices. */
  readonly logout: Effect.Effect<void>
  /** Stops without unlinking. No events arrive after this. */
  readonly close: Effect.Effect<void>
}

/** A WhatsApp account linked as a device, the way WhatsApp Web is. */
export class WhatsAppClient extends Context.Service<
  WhatsAppClient,
  {
    connect(
      session: SessionStore,
      onEvent: (event: ClientEvent) => void
    ): Effect.Effect<WhatsAppConnection, WhatsAppClientError>
  }
>()("@scope-bot/integrations/WhatsAppClient") {}
