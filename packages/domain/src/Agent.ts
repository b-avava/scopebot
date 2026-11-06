import { Schema } from "effect"
import { ReasoningEffort } from "./Model.ts"

/** Backups an agent can keep, in the order they are tried. */
export const MAX_BACKUP_MODELS = 8

export const AgentId = Schema.String.pipe(Schema.brand("AgentId"))
export type AgentId = typeof AgentId.Type

export const AgentShape = Schema.Literals([
  "circle",
  "pebble",
  "squircle",
  "capsule",
  "triangle",
  "hexagon",
  "cloud",
  "droplet"
])
export type AgentShape = typeof AgentShape.Type

export const AgentFace = Schema.Literals([
  "neutral",
  "attentive",
  "surprised",
  "excited",
  "happy",
  "laughing",
  "angry",
  "sad",
  "scared",
  "suspicious",
  "confused",
  "curious",
  "proud",
  "shy",
  "unimpressed",
  "sleepy"
])
export type AgentFace = typeof AgentFace.Type

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

/** What the business can change about an agent. */
export const AgentSettings = Schema.Struct({
  name: Schema.NonEmptyString,
  job: Schema.NonEmptyString,
  color: Schema.NonEmptyString,
  shape: AgentShape,
  face: AgentFace,
  tone: AgentTone,
  /** Special rules of the business, in its own words. */
  instructions: Schema.String,
  /** Model id of the configured provider. Empty uses the server default. */
  model: Schema.String,
  reasoning: ReasoningEffort,
  /** Tried in order when `model` cannot answer. */
  backupModels: Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_BACKUP_MODELS)),
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
  createdAt: Schema.String
})
export type Agent = typeof Agent.Type

export const CreateAgent = Schema.Struct({
  name: Schema.NonEmptyString,
  job: Schema.NonEmptyString,
  color: Schema.NonEmptyString,
  shape: AgentShape,
  face: AgentFace
})
export type CreateAgent = typeof CreateAgent.Type

type JobPreset = Pick<AgentSettings, "permissions" | "limits" | "tone">

const frontDesk: JobPreset = {
  tone: "friendly",
  limits: { maxDiscountPercent: 0, maxMessagesPerDay: 30 },
  permissions: {
    bookAppointments: "auto",
    rescheduleAppointments: "auto",
    cancelAppointments: "approve",
    offerDiscounts: "deny",
    sendPaymentLinks: "deny",
    sendDocuments: "approve"
  }
}

const jobPresets: Record<string, JobPreset> = {
  "Front desk": frontDesk,
  Sales: {
    tone: "friendly",
    limits: { maxDiscountPercent: 10, maxMessagesPerDay: 30 },
    permissions: {
      bookAppointments: "auto",
      rescheduleAppointments: "approve",
      cancelAppointments: "deny",
      offerDiscounts: "approve",
      sendPaymentLinks: "approve",
      sendDocuments: "approve"
    }
  },
  "Follow-ups": {
    tone: "friendly",
    limits: { maxDiscountPercent: 0, maxMessagesPerDay: 10 },
    permissions: {
      bookAppointments: "approve",
      rescheduleAppointments: "auto",
      cancelAppointments: "deny",
      offerDiscounts: "deny",
      sendPaymentLinks: "deny",
      sendDocuments: "deny"
    }
  },
  Reports: {
    tone: "brief",
    limits: { maxDiscountPercent: 0, maxMessagesPerDay: 30 },
    permissions: {
      bookAppointments: "deny",
      rescheduleAppointments: "deny",
      cancelAppointments: "deny",
      offerDiscounts: "deny",
      sendPaymentLinks: "deny",
      sendDocuments: "deny"
    }
  }
}

/** Sensible settings for a new agent, based on its job. */
export const defaultSettings = (input: CreateAgent): AgentSettings => ({
  ...input,
  ...(jobPresets[input.job] ?? frontDesk),
  instructions: "",
  model: "",
  reasoning: "default",
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
