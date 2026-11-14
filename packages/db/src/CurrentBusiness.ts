import type { BusinessId, Conversation, UserId } from "@scope-bot/domain"
import { Context, Effect } from "effect"

/**
 * The business a request works in. The API sets it from the session, so domain
 * services stay unaware of tenants and cannot forget to pass one.
 */
export const CurrentBusiness = Context.Reference<BusinessId | null>("@scope-bot/db/CurrentBusiness", {
  defaultValue: () => null
})

/** The person a request is for, as far as the in-app chats go. */
export interface ChatViewer {
  readonly userId: UserId
  /** How the employee calls the person. */
  readonly name: string
  /** Owners and admins also see the tabs from before tabs had owners. */
  readonly seesShared: boolean
}

/**
 * The person whose in-app chats a request may see. The API sets it from the
 * session. Empty in background work, which sees every chat.
 */
export const CurrentViewer = Context.Reference<ChatViewer | null>("@scope-bot/db/CurrentViewer", {
  defaultValue: () => null
})

/** Chats with customers belong to the whole business. A tab belongs to its owner. */
export const visibleTo = (conversation: Conversation, viewer: ChatViewer | null) =>
  conversation.channel !== undefined ||
  viewer === null ||
  (conversation.ownerId === undefined ? viewer.seesShared : conversation.ownerId === viewer.userId)

/** Storage has no way to answer without a business, so this is a bug and never a user error. */
export const requireBusiness = Effect.gen(function* () {
  const business = yield* CurrentBusiness
  if (business === null) return yield* Effect.die("Storage was used outside a business")
  return business
})
