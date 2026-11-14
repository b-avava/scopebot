import type { ChatMessage, MessageId } from "./Chat.ts"

/**
 * Versions of messages in a chat with the team (ADR 0023). A question edited
 * or an answer given again is a new message that names the first version in
 * `replaces`. Nothing is deleted: what a chat shows is worked out here, on the
 * server for the model's history and in the app for the screen.
 */

/** The first version of a message, which every later version names. */
export const versionRoot = (message: ChatMessage): MessageId => message.replaces ?? message.id

/** Every version of a message, oldest first, of the same role. */
export const versionsOf = (messages: ReadonlyArray<ChatMessage>, message: ChatMessage) => {
  const root = versionRoot(message)
  return messages.filter((item) => item.role === message.role && versionRoot(item) === root)
}

/**
 * The messages a chat shows: for each message with versions, the chosen one or
 * else the latest. A question that is not shown hides its whole exchange, which
 * runs up to the next question in the same chat.
 */
export const visibleMessages = (
  messages: ReadonlyArray<ChatMessage>,
  chosen: ReadonlyMap<MessageId, MessageId> = new Map()
): ReadonlyArray<ChatMessage> => {
  const latest = new Map<string, MessageId>()
  for (const message of messages) latest.set(`${message.role}:${versionRoot(message)}`, message.id)
  const shownVersion = (message: ChatMessage) =>
    (chosen.get(versionRoot(message)) ?? latest.get(`${message.role}:${versionRoot(message)}`)) === message.id

  const hiddenChats = new Set<string>()
  return messages.filter((message) => {
    if (message.role === "customer") {
      const shown = shownVersion(message)
      if (shown) hiddenChats.delete(message.conversationId)
      else hiddenChats.add(message.conversationId)
      return shown
    }
    if (hiddenChats.has(message.conversationId)) return false
    return message.role !== "agent" || shownVersion(message)
  })
}
