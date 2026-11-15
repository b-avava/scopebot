import { Authorization, CurrentSession } from "@scope-bot/contracts"
import { BusinessId, UserId } from "@scope-bot/domain"
import { Effect, Layer } from "effect"

const asOwner = <A, E, R>(httpEffect: Effect.Effect<A, E, R>) =>
  httpEffect.pipe(
    Effect.provideService(CurrentSession, {
      token: "test",
      account: {
        businessId: BusinessId.make("test-business"),
        businessName: "Test",
        user: { id: UserId.make("owner"), email: "owner@example.com", name: "Owner", role: "owner", createdAt: "" }
      }
    })
  )

/** Lets handler tests skip sessions. Sessions themselves are tested in `Auth.test.ts`, on real PostgreSQL. */
export const TestAuthorization = Layer.succeed(Authorization, Authorization.of({ bearer: asOwner, cookie: asOwner }))
