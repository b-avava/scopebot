import { Schema } from "effect"
import { AgentId } from "./Agent.ts"
import { UserId } from "./Auth.ts"
import { ConversationId, MessageId } from "./Chat.ts"

/** Feedback on answers and rules from the team, which teach an employee (ADR 0023). */

export const FeedbackRating = Schema.Literals(["good", "bad"])
export type FeedbackRating = typeof FeedbackRating.Type

export const FeedbackReason = Schema.Literals(["wrong-facts", "too-long", "wrong-tone", "should-ask-person"])
export type FeedbackReason = typeof FeedbackReason.Type

export const MAX_FEEDBACK_NOTE = 1000

export const GiveFeedback = Schema.Struct({
  rating: FeedbackRating,
  reasons: Schema.Array(FeedbackReason).check(Schema.isMaxLength(4)),
  note: Schema.String.check(Schema.isMaxLength(MAX_FEEDBACK_NOTE))
})
export type GiveFeedback = typeof GiveFeedback.Type

/** One person's feedback on one answer. They can change it. */
export const MessageFeedback = Schema.Struct({
  ...GiveFeedback.fields,
  messageId: MessageId,
  agentId: AgentId,
  conversationId: ConversationId,
  userId: UserId,
  userName: Schema.String,
  createdAt: Schema.String
})
export type MessageFeedback = typeof MessageFeedback.Type

export const RuleId = Schema.String.pipe(Schema.brand("RuleId"))
export type RuleId = typeof RuleId.Type

/** Rules that are on, at most, and the longest rule. */
export const MAX_ACTIVE_RULES = 30
export const MAX_RULE_LENGTH = 300

export const RulePerson = Schema.Struct({ userId: UserId, name: Schema.String })
export type RulePerson = typeof RulePerson.Type

/**
 * A rule the employee follows in every chat. An owner or admin adds it, or adds
 * one a member suggested. Only an active rule that is on reaches the model.
 */
export const AgentRule = Schema.Struct({
  id: RuleId,
  agentId: AgentId,
  text: Schema.String,
  enabled: Schema.Boolean,
  status: Schema.Literals(["active", "suggested", "declined"]),
  /** The member who suggested it. Empty when an owner or admin wrote it. */
  suggestedBy: Schema.NullOr(RulePerson),
  /** The owner or admin who added it or declined it. Empty while it waits. */
  decidedBy: Schema.NullOr(RulePerson),
  /** The answer it came from, when it came from feedback. */
  sourceMessageId: Schema.NullOr(MessageId),
  createdAt: Schema.String,
  decidedAt: Schema.NullOr(Schema.String)
})
export type AgentRule = typeof AgentRule.Type

const RuleText = Schema.Trim.pipe(
  Schema.decodeTo(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_RULE_LENGTH)))
)

export const NewRule = Schema.Struct({
  text: RuleText,
  sourceMessageId: Schema.optionalKey(MessageId)
})
export type NewRule = typeof NewRule.Type

export const RulePatch = Schema.Struct({
  text: Schema.optionalKey(RuleText),
  enabled: Schema.optionalKey(Schema.Boolean)
})
export type RulePatch = typeof RulePatch.Type

export const RuleDecision = Schema.Struct({ accept: Schema.Boolean })
export type RuleDecision = typeof RuleDecision.Type

/** A note from feedback, for the employee to turn into one rule. */
export const DraftRule = Schema.Struct({
  note: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_FEEDBACK_NOTE)),
  messageId: Schema.optionalKey(MessageId)
})
export type DraftRule = typeof DraftRule.Type

export const DraftedRule = Schema.Struct({ text: Schema.String })
export type DraftedRule = typeof DraftedRule.Type

export class RuleNotFound extends Schema.TaggedError<RuleNotFound>()("RuleNotFound", {}, { httpApiStatus: 404 }) {}

/** Turning one more rule on would pass the limit. */
export class TooManyRules extends Schema.TaggedError<TooManyRules>()("TooManyRules", {}, { httpApiStatus: 409 }) {}

/** Only the last question of a chat with the team can be asked again or edited. */
export class CannotAnswerAgain extends Schema.TaggedError<CannotAnswerAgain>()(
  "CannotAnswerAgain",
  {},
  { httpApiStatus: 409 }
) {}

/** The last question asked again in other words. */
export const EditQuestion = Schema.Struct({
  text: Schema.Trim.pipe(Schema.decodeTo(Schema.String.check(Schema.isNonEmpty())))
})
export type EditQuestion = typeof EditQuestion.Type
