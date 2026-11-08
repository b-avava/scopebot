import type { BusinessId } from "@scope-bot/domain"
import { Context, Effect } from "effect"

/**
 * The business a request works in. The API sets it from the session, so domain
 * services stay unaware of tenants and cannot forget to pass one.
 */
export const CurrentBusiness = Context.Reference<BusinessId | null>("@scope-bot/db/CurrentBusiness", {
  defaultValue: () => null
})

/** Storage has no way to answer without a business, so this is a bug and never a user error. */
export const requireBusiness = Effect.gen(function* () {
  const business = yield* CurrentBusiness
  if (business === null) return yield* Effect.die("Storage was used outside a business")
  return business
})
