import { type ChatViewer, CurrentViewer, Store } from "@scope-bot/db"
import {
  type AgentId,
  type AgentNotFound,
  type AgentRule,
  type ConversationId,
  ConversationNotFound,
  Forbidden,
  type GiveFeedback,
  MAX_ACTIVE_RULES,
  type MessageFeedback,
  type MessageId,
  type NewRule,
  type RuleDecision,
  RuleId,
  RuleNotFound,
  type RulePatch,
  TooManyRules
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { AgentChat } from "./AgentChat.ts"
import { Agents, nowIso } from "./Agents.ts"

/** Who a person is, as a rule keeps it. */
const personOf = (viewer: ChatViewer) => ({ userId: viewer.userId, name: viewer.name })

/**
 * Feedback on answers and rules from the team (ADR 0023). Owners and admins
 * decide the rules; a member suggests one and it waits for them.
 */
export class Coaching extends Context.Service<
  Coaching,
  {
    /** The person's 👍 or 👎 on an answer they can see. Replaces what they gave before. */
    giveFeedback(
      agentId: AgentId,
      conversationId: ConversationId,
      messageId: MessageId,
      input: GiveFeedback
    ): Effect.Effect<MessageFeedback, AgentNotFound | ConversationNotFound | Forbidden>
    /** The person's own feedback in a chat. */
    feedback(
      agentId: AgentId,
      conversationId: ConversationId
    ): Effect.Effect<ReadonlyArray<MessageFeedback>, AgentNotFound | ConversationNotFound>
    rules(agentId: AgentId): Effect.Effect<ReadonlyArray<AgentRule>, AgentNotFound>
    /** An owner or admin adds a rule at once; a member's waits for one of them. */
    addRule(
      agentId: AgentId,
      input: NewRule,
      decides: boolean
    ): Effect.Effect<AgentRule, AgentNotFound | TooManyRules | Forbidden>
    changeRule(agentId: AgentId, id: RuleId, patch: RulePatch): Effect.Effect<AgentRule, RuleNotFound | TooManyRules>
    decideRule(
      agentId: AgentId,
      id: RuleId,
      decision: RuleDecision
    ): Effect.Effect<AgentRule, RuleNotFound | TooManyRules | Forbidden>
    removeRule(agentId: AgentId, id: RuleId): Effect.Effect<void, RuleNotFound>
  }
>()("@scope-bot/agents/Coaching") {
  static readonly layer = Layer.effect(
    Coaching,
    Effect.gen(function* () {
      const store = yield* Store
      const agents = yield* Agents
      const chat = yield* AgentChat

      /** Feedback and rules come from a person, never from background work. */
      const viewer = CurrentViewer.pipe(
        Effect.flatMap((current) => (current === null ? Effect.fail(new Forbidden()) : Effect.succeed(current)))
      )

      const findRule = (agentId: AgentId, id: RuleId) =>
        store
          .findRule(id)
          .pipe(
            Effect.flatMap((found) =>
              Option.isSome(found) && found.value.agentId === agentId
                ? Effect.succeed(found.value)
                : Effect.fail(new RuleNotFound())
            )
          )

      /** One more rule that is on must still fit under the limit. */
      const roomFor = (agentId: AgentId, except: RuleId | null) =>
        store
          .rules(agentId)
          .pipe(
            Effect.flatMap((rules) =>
              rules.filter((rule) => rule.status === "active" && rule.enabled && rule.id !== except).length >=
              MAX_ACTIVE_RULES
                ? Effect.fail(new TooManyRules())
                : Effect.void
            )
          )

      return Coaching.of({
        giveFeedback: Effect.fn("Coaching.giveFeedback")(function* (agentId, conversationId, messageId, input) {
          const messages = yield* chat.messages(agentId, conversationId)
          const answer = messages.find((message) => message.id === messageId && message.role === "agent")
          if (answer === undefined) return yield* new ConversationNotFound()
          const person = yield* viewer
          const feedback: MessageFeedback = {
            ...input,
            note: input.note.trim(),
            messageId,
            agentId,
            conversationId,
            userId: person.userId,
            userName: person.name,
            createdAt: yield* nowIso
          }
          yield* store.saveFeedback(feedback)
          return feedback
        }),
        feedback: Effect.fn("Coaching.feedback")(function* (agentId, conversationId) {
          yield* chat.messages(agentId, conversationId)
          const person = yield* CurrentViewer
          return person === null ? [] : yield* store.feedbackOf(conversationId, person.userId)
        }),
        rules: (agentId) => agents.get(agentId).pipe(Effect.andThen(store.rules(agentId))),
        addRule: Effect.fn("Coaching.addRule")(function* (agentId, input, decides) {
          yield* agents.get(agentId)
          const person = personOf(yield* viewer)
          if (decides) yield* roomFor(agentId, null)
          const now = yield* nowIso
          const rule: AgentRule = {
            id: RuleId.make(crypto.randomUUID()),
            agentId,
            text: input.text,
            enabled: true,
            status: decides ? "active" : "suggested",
            suggestedBy: decides ? null : person,
            decidedBy: decides ? person : null,
            sourceMessageId: input.sourceMessageId ?? null,
            createdAt: now,
            decidedAt: decides ? now : null
          }
          yield* store.saveRule(rule)
          return rule
        }),
        changeRule: Effect.fn("Coaching.changeRule")(function* (agentId, id, patch) {
          const rule = yield* findRule(agentId, id)
          if (patch.enabled === true && !rule.enabled && rule.status === "active") yield* roomFor(agentId, id)
          const changed: AgentRule = { ...rule, ...patch }
          yield* store.saveRule(changed)
          return changed
        }),
        decideRule: Effect.fn("Coaching.decideRule")(function* (agentId, id, decision) {
          const rule = yield* findRule(agentId, id)
          if (rule.status !== "suggested") return yield* new RuleNotFound()
          if (decision.accept) yield* roomFor(agentId, id)
          const decided: AgentRule = {
            ...rule,
            status: decision.accept ? "active" : "declined",
            decidedBy: personOf(yield* viewer),
            decidedAt: yield* nowIso
          }
          yield* store.saveRule(decided)
          return decided
        }),
        removeRule: (agentId, id) => findRule(agentId, id).pipe(Effect.andThen(store.removeRule(id)))
      })
    })
  )
}
