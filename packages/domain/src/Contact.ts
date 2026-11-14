import { Schema } from "effect"
import { AgentId } from "./Agent.ts"

export const ContactId = Schema.String.pipe(Schema.brand("ContactId"))
export type ContactId = typeof ContactId.Type

export const ContactKind = Schema.Literals(["person", "company"])
export type ContactKind = typeof ContactKind.Type

/** How to reach a contact. Empty means the contact does not use that channel. */
export const ContactChannels = Schema.Struct({
  phone: Schema.String,
  whatsapp: Schema.String,
  telegram: Schema.String
})
export type ContactChannels = typeof ContactChannels.Type

/** What the contact agreed to. Everything starts as not agreed. */
export const ContactConsent = Schema.Struct({
  /** Being messaged first, not only answered. */
  messages: Schema.Boolean,
  /** Offers and promotions. */
  marketing: Schema.Boolean
})
export type ContactConsent = typeof ContactConsent.Type

/** What can change about a contact. */
export const ContactDetails = Schema.Struct({
  kind: ContactKind,
  name: Schema.NonEmptyString,
  channels: ContactChannels,
  consent: ContactConsent,
  /** The company a person works at. */
  companyId: Schema.NullOr(ContactId),
  /** The person's role at that company. */
  role: Schema.String,
  /** The employee responsible. Empty means a person is. */
  ownerId: Schema.NullOr(AgentId),
  tags: Schema.Array(Schema.String),
  language: Schema.String,
  /** When the contact prefers to be reached, in the business's own words. */
  bestTime: Schema.String,
  source: Schema.String
})
export type ContactDetails = typeof ContactDetails.Type

/** What an employee wrote about a contact. It is written by a model, so it is an opinion, not a fact. */
export const ContactSummary = Schema.Struct({
  text: Schema.String,
  agentId: AgentId,
  updatedAt: Schema.String
})
export type ContactSummary = typeof ContactSummary.Type

export const Contact = Schema.Struct({
  id: ContactId,
  ...ContactDetails.fields,
  summary: Schema.NullOr(ContactSummary),
  createdAt: Schema.String
})
export type Contact = typeof Contact.Type

export const emptyContactDetails = {
  kind: "person",
  channels: { phone: "", whatsapp: "", telegram: "" },
  consent: { messages: false, marketing: false },
  companyId: null,
  role: "",
  ownerId: null,
  tags: [],
  language: "",
  bestTime: "",
  source: ""
} as const satisfies Omit<ContactDetails, "name">

export class ContactNotFound extends Schema.TaggedError<ContactNotFound>()(
  "ContactNotFound",
  {},
  { httpApiStatus: 404 }
) {}
