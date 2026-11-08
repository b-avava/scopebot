import { Schema } from "effect"
import { DepartmentId } from "./Department.ts"
import { ModelChoice, ProviderId, ReasoningEffort } from "./Model.ts"

/** Backups an agent can keep, in the order they are tried. */
export const MAX_BACKUP_MODELS = 8

export const AgentId = Schema.String.pipe(Schema.brand("AgentId"))
export type AgentId = typeof AgentId.Type

export const AgentTone = Schema.Literals(["friendly", "formal", "brief"])
export type AgentTone = typeof AgentTone.Type

/** What an agent may do with an action: alone, after approval, or not at all. */
export const ActionPolicy = Schema.Literals(["auto", "approve", "deny"])
export type ActionPolicy = typeof ActionPolicy.Type

export const AgentPermissions = Schema.Struct({
  bookAppointments: ActionPolicy,
  rescheduleAppointments: ActionPolicy,
  cancelAppointments: ActionPolicy,
  offerDiscounts: ActionPolicy,
  sendPaymentLinks: ActionPolicy,
  sendDocuments: ActionPolicy
})
export type AgentPermissions = typeof AgentPermissions.Type

export const AgentLimits = Schema.Struct({
  maxDiscountPercent: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  /** Replies in a rolling 24 hours. After that the chat goes to a human. */
  maxMessagesPerDay: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
})
export type AgentLimits = typeof AgentLimits.Type

export const WorkingHours = Schema.Struct({
  /** Off means the agent answers around the clock. */
  enabled: Schema.Boolean,
  from: Schema.String,
  to: Schema.String,
  /** 0 is Sunday. */
  days: Schema.Array(Schema.Int),
  timeZone: Schema.String,
  /** Sent outside working hours, without calling the model. */
  awayMessage: Schema.String
})
export type WorkingHours = typeof WorkingHours.Type

/** Situations in which the agent hands the chat to a human. */
export const EscalationRules = Schema.Struct({
  onComplaint: Schema.Boolean,
  onHumanRequest: Schema.Boolean,
  onUnknownAnswer: Schema.Boolean
})
export type EscalationRules = typeof EscalationRules.Type

/** A small mark on the avatar. Empty shows none. */
export const AgentSign = Schema.Literals(["headset", "tag", "repeat", "chart"])
export type AgentSign = typeof AgentSign.Type

/** What an employee starts from when hired. It only picks the first settings. */
export const AgentRole = Schema.Literals(["sales", "support", "follow-ups", "reports", "blank"])
export type AgentRole = typeof AgentRole.Type

/** What the business can change about an agent. */
export const AgentSettings = Schema.Struct({
  name: Schema.NonEmptyString,
  /** The job title in the business's own words. The model and customers see it. */
  job: Schema.NonEmptyString,
  sign: Schema.NullOr(AgentSign),
  /** Empty keeps the employee in the general team. */
  departmentId: Schema.NullOr(DepartmentId),
  color: Schema.NonEmptyString,
  tone: AgentTone,
  /** Special rules of the business, in its own words. */
  instructions: Schema.String,
  provider: ProviderId,
  /** Model id on that provider. Empty uses its default. */
  model: Schema.String,
  reasoning: ReasoningEffort,
  /** Tried in order when `model` cannot answer. */
  backupModels: Schema.Array(ModelChoice).check(Schema.isMaxLength(MAX_BACKUP_MODELS)),
  /** A paused agent does not answer. */
  active: Schema.Boolean,
  permissions: AgentPermissions,
  limits: AgentLimits,
  hours: WorkingHours,
  escalation: EscalationRules
})
export type AgentSettings = typeof AgentSettings.Type

export const Agent = Schema.Struct({
  id: AgentId,
  ...AgentSettings.fields,
  /** The role it was hired with. Empty for employees hired before roles. */
  role: Schema.NullOr(AgentRole),
  /** Pinned employees stay at the top of the team. */
  pinned: Schema.Boolean,
  createdAt: Schema.String
})
export type Agent = typeof Agent.Type

/**
 * What an employee is doing now, worked out from data. The avatar shows it.
 * Earlier entries win: a paused employee waiting for an approval is paused.
 */
export const AgentState = Schema.Literals(["paused", "approval", "with-person", "after-hours", "working"])
export type AgentState = typeof AgentState.Type

export const AgentStatus = Schema.Struct({
  agentId: AgentId,
  state: AgentState
})
export type AgentStatus = typeof AgentStatus.Type

export const PinAgent = Schema.Struct({
  pinned: Schema.Boolean
})
export type PinAgent = typeof PinAgent.Type

export const CreateAgent = Schema.Struct({
  name: Schema.NonEmptyString,
  job: Schema.NonEmptyString,
  color: Schema.NonEmptyString,
  role: Schema.optionalKey(AgentRole),
  provider: Schema.optionalKey(ProviderId),
  model: Schema.optionalKey(Schema.String),
  reasoning: Schema.optionalKey(ReasoningEffort)
})
export type CreateAgent = typeof CreateAgent.Type

type RolePreset = Pick<AgentSettings, "permissions" | "limits" | "tone" | "sign">

/** Everything risky waits for a person. The safe start for any job. */
const blank: RolePreset = {
  tone: "friendly",
  sign: null,
  limits: { maxDiscountPercent: 0, maxMessagesPerDay: 30 },
  permissions: {
    bookAppointments: "approve",
    rescheduleAppointments: "approve",
    cancelAppointments: "approve",
    offerDiscounts: "approve",
    sendPaymentLinks: "approve",
    sendDocuments: "approve"
  }
}

/** First settings for each role. After hiring they belong to the employee. */
export const rolePresets: Record<AgentRole, RolePreset> = {
  sales: {
    tone: "friendly",
    sign: "tag",
    limits: { maxDiscountPercent: 10, maxMessagesPerDay: 30 },
    permissions: {
      bookAppointments: "approve",
      rescheduleAppointments: "approve",
      cancelAppointments: "deny",
      offerDiscounts: "approve",
      sendPaymentLinks: "approve",
      sendDocuments: "approve"
    }
  },
  support: {
    tone: "friendly",
    sign: "headset",
    limits: { maxDiscountPercent: 0, maxMessagesPerDay: 40 },
    permissions: {
      bookAppointments: "approve",
      rescheduleAppointments: "approve",
      cancelAppointments: "approve",
      offerDiscounts: "deny",
      sendPaymentLinks: "deny",
      sendDocuments: "approve"
    }
  },
  "follow-ups": {
    tone: "friendly",
    sign: "repeat",
    limits: { maxDiscountPercent: 0, maxMessagesPerDay: 10 },
    permissions: {
      bookAppointments: "approve",
      rescheduleAppointments: "approve",
      cancelAppointments: "deny",
      offerDiscounts: "deny",
      sendPaymentLinks: "deny",
      sendDocuments: "deny"
    }
  },
  reports: {
    tone: "brief",
    sign: "chart",
    limits: { maxDiscountPercent: 0, maxMessagesPerDay: 30 },
    permissions: {
      bookAppointments: "deny",
      rescheduleAppointments: "deny",
      cancelAppointments: "deny",
      offerDiscounts: "deny",
      sendPaymentLinks: "deny",
      sendDocuments: "deny"
    }
  },
  blank
}

/** Sensible settings for a new agent, from the role it starts with. */
export const defaultSettings = ({ role = "blank", ...input }: CreateAgent): AgentSettings => ({
  ...input,
  ...rolePresets[role],
  departmentId: null,
  instructions: "",
  provider: input.provider ?? "api",
  model: input.model ?? "",
  reasoning: input.reasoning ?? "default",
  backupModels: [],
  active: true,
  hours: {
    enabled: false,
    from: "09:00",
    to: "18:00",
    days: [1, 2, 3, 4, 5, 6],
    timeZone: "Asia/Tbilisi",
    awayMessage: "Thanks for your message! We are closed right now and will reply during working hours."
  },
  escalation: { onComplaint: true, onHumanRequest: true, onUnknownAnswer: true }
})

export class AgentNotFound extends Schema.TaggedError<AgentNotFound>()("AgentNotFound", {}, { httpApiStatus: 404 }) {}

export class AgentPaused extends Schema.TaggedError<AgentPaused>()("AgentPaused", {}, { httpApiStatus: 409 }) {}
