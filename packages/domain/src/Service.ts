import { Schema } from "effect"
import { ActionPolicy, AgentId } from "./Agent.ts"

export const ServiceId = Schema.String.pipe(Schema.brand("ServiceId"))
export type ServiceId = typeof ServiceId.Type

/** How the price of a service reads. */
export const ServicePricing = Schema.Literals(["fixed", "from", "hourly", "monthly"])
export type ServicePricing = typeof ServicePricing.Type

const Money = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))

export const ServicePackage = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  duration: Schema.String,
  price: Money
})
export type ServicePackage = typeof ServicePackage.Type

/** What can change about a service. */
export const ServiceDetails = Schema.Struct({
  name: Schema.NonEmptyString,
  description: Schema.String,
  category: Schema.String,
  pricing: ServicePricing,
  /** Empty means the service has no price yet, and employees must not name one. */
  price: Schema.NullOr(Money),
  duration: Schema.String,
  packages: Schema.Array(ServicePackage),
  active: Schema.Boolean,
  /** Whether employees may name the price. */
  quotePolicy: ActionPolicy,
  /** Whether employees may send a written quote. */
  proposalPolicy: ActionPolicy,
  /** Whether employees may offer a discount, up to `maxDiscountPercent`. */
  discountPolicy: ActionPolicy,
  maxDiscountPercent: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  /** Who may sell it. Empty means every employee. */
  sellerIds: Schema.Array(AgentId)
})
export type ServiceDetails = typeof ServiceDetails.Type

export const Service = Schema.Struct({
  id: ServiceId,
  ...ServiceDetails.fields,
  createdAt: Schema.String
})
export type Service = typeof Service.Type

export const emptyServiceDetails = {
  description: "",
  category: "",
  pricing: "fixed",
  price: null,
  duration: "",
  packages: [],
  active: true,
  quotePolicy: "auto",
  proposalPolicy: "approve",
  discountPolicy: "approve",
  maxDiscountPercent: 0,
  sellerIds: []
} as const satisfies Omit<ServiceDetails, "name">

/** A question to try on an employee, as if a customer asked it. */
export const ServicePreview = Schema.Struct({
  agentId: AgentId,
  text: Schema.NonEmptyString
})
export type ServicePreview = typeof ServicePreview.Type

export class ServiceNotFound extends Schema.TaggedError<ServiceNotFound>()(
  "ServiceNotFound",
  {},
  { httpApiStatus: 404 }
) {}
