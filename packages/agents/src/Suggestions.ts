import { CurrentViewer, Store } from "@scope-bot/db"
import {
  type AgentId,
  type AppointmentStep,
  type ChatMessage,
  type ContactId,
  type ConversationId,
  type DecideSuggestion,
  type MessageId,
  SuggestionNotFound
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { newMessage } from "./AgentChat.ts"
import { nowIso } from "./Agents.ts"
import { Calendar } from "./Calendar.ts"
import { type AppointmentStepError, applyStep } from "./ChannelInbox.ts"
import { Reminders, type Told } from "./Reminders.ts"

const channelNames = { whatsapp: "WhatsApp", telegram: "Telegram", instagram: "Instagram" }

const toldText = (client: string, told: Told) =>
  told.outcome === "sent" && told.channel !== null
    ? `${client} was told on ${channelNames[told.channel]}.`
    : `${client} was not told: ${told.reason}.`

/**
 * What a person does with an employee's suggestion in a chat with the team.
 * Nothing changes until they say so, and then the client is told.
 */
export class Suggestions extends Context.Service<
  Suggestions,
  {
    decide(
      agentId: AgentId,
      conversationId: ConversationId,
      messageId: MessageId,
      decision: DecideSuggestion["decision"]
    ): Effect.Effect<ChatMessage, SuggestionNotFound | AppointmentStepError>
  }
>()("@scope-bot/agents/Suggestions") {
  static readonly layer = Layer.effect(
    Suggestions,
    Effect.gen(function* () {
      const store = yield* Store
      const calendar = yield* Calendar
      const reminders = yield* Reminders

      /** A suggestion that still waits, in a tab the person may see, about an appointment they may see. */
      const waiting = Effect.fn("Suggestions.waiting")(function* (
        agentId: AgentId,
        conversationId: ConversationId,
        messageId: MessageId
      ) {
        const conversation = Option.getOrUndefined(yield* store.findConversation(conversationId))
        const message = Option.getOrUndefined(yield* store.findMessage(messageId))
        const step = message?.appointment
        const tab = conversation !== undefined && conversation.agentId === agentId && conversation.channel === undefined
        if (!tab || message?.conversationId !== conversationId || step === undefined || step.decided !== undefined) {
          return yield* new SuggestionNotFound()
        }
        if (step.kind === "book") return yield* new SuggestionNotFound()
        const appointment = yield* calendar
          .find(step.appointmentId)
          .pipe(Effect.mapError(() => new SuggestionNotFound()))
        // Someone who sees only their own appointments can act only on those.
        const viewer = yield* CurrentViewer
        const own = (yield* calendar.specialists).find((item) => viewer !== null && item.userId === viewer.userId)
        if (viewer !== null && !viewer.seesShared && own?.id !== appointment.specialistId) {
          return yield* new SuggestionNotFound()
        }
        return { message, step, appointment }
      })

      const decided = (message: ChatMessage, step: AppointmentStep, value: "done" | "left") => {
        const saved: ChatMessage = { ...message, appointment: { ...step, decided: value } }
        return store.saveMessage(saved).pipe(Effect.as(saved))
      }

      /** The log records who decided, either way (ADR 0022). */
      const audit = (message: ChatMessage, step: AppointmentStep, summary: string, agreed: boolean) =>
        Effect.gen(function* () {
          const viewer = yield* CurrentViewer
          yield* store.appendAction({
            id: crypto.randomUUID(),
            agentId: message.agentId,
            tool: `calendar.${step.kind}`,
            status: "done",
            summary,
            sourceMessageId: message.id,
            model: "",
            inputTokens: 0,
            outputTokens: 0,
            createdAt: yield* nowIso,
            conversationId: message.conversationId,
            appointmentId: step.appointmentId,
            ...(viewer === null ? {} : { decidedBy: { userId: viewer.userId, name: viewer.name, agreed } })
          })
        })

      const clientName = (contactId: ContactId | null) =>
        contactId === null
          ? Effect.succeed("The client")
          : store
              .findContact(contactId)
              .pipe(Effect.map(Option.match({ onNone: () => "The client", onSome: (contact) => contact.name })))

      return Suggestions.of({
        decide: Effect.fn("Suggestions.decide")(function* (agentId, conversationId, messageId, decision) {
          const { message, step, appointment } = yield* waiting(agentId, conversationId, messageId)
          const client = yield* clientName(appointment.contactId)
          const verb = step.kind === "move" ? "move" : "cancel"
          if (decision === "leave") {
            const left = yield* decided(message, step, "left")
            yield* audit(message, step, `A person left the suggestion to ${verb} the appointment of ${client}`, false)
            return left
          }
          const changed = yield* applyStep(calendar, step, null)
          const saved = yield* decided(message, step, "done")
          const told = yield* reminders.tell(changed, step.kind === "move" ? "moved" : "cancelled")
          const done = step.kind === "move" ? "Moved" : "Cancelled"
          yield* store.appendMessage(
            yield* newMessage(agentId, conversationId, "note", `${done}. ${toldText(client, told)}`)
          )
          yield* audit(
            message,
            step,
            `A person agreed to the suggestion: ${done.toLowerCase()} the appointment of ${client}`,
            true
          )
          return saved
        })
      })
    })
  )
}
