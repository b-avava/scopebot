import { Schema } from "effect"

/** Facts all agents may tell customers. Anything else they must not invent. */
export const BusinessProfile = Schema.Struct({
  name: Schema.String,
  address: Schema.String,
  phone: Schema.String,
  openingHours: Schema.String,
  about: Schema.String,
  /** The currency amounts are in. */
  currency: Schema.String
})
export type BusinessProfile = typeof BusinessProfile.Type

/** A calendar date like 2026-11-30, without a time. */
export const Day = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter((day) => !Number.isNaN(Date.parse(day)))
)

/** Something a record points at is not in this business. */
export class ReferenceNotFound extends Schema.TaggedError<ReferenceNotFound>()(
  "ReferenceNotFound",
  {},
  { httpApiStatus: 422 }
) {}

export const emptyBusinessProfile: BusinessProfile = {
  name: "",
  address: "",
  phone: "",
  openingHours: "",
  about: "",
  currency: "GEL"
}
