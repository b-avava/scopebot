import { Schema } from "effect"

export const BusinessService = Schema.Struct({
  name: Schema.String,
  /** Free text, so "from 50 GEL" works. */
  price: Schema.String
})
export type BusinessService = typeof BusinessService.Type

/** Facts all agents may tell customers. Anything else they must not invent. */
export const BusinessProfile = Schema.Struct({
  name: Schema.String,
  address: Schema.String,
  phone: Schema.String,
  openingHours: Schema.String,
  about: Schema.String,
  services: Schema.Array(BusinessService)
})
export type BusinessProfile = typeof BusinessProfile.Type

export const emptyBusinessProfile: BusinessProfile = {
  name: "",
  address: "",
  phone: "",
  openingHours: "",
  about: "",
  services: []
}
