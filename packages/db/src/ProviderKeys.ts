import type { ProviderId, ProviderKey, VoiceProviderId } from "@scope-bot/domain"

/** Whose key it is: a model provider, or the one that turns speech into text. */
export type KeyOwner = ProviderId | VoiceProviderId

import { Context, Effect, Layer, Option, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { requireBusiness } from "./CurrentBusiness.ts"
import { decrypt, encrypt, parseSecret } from "./Secrets.ts"

export interface StoredKey {
  readonly key: Redacted.Redacted<string>
  /** Empty uses the provider's own address. */
  readonly baseUrl: string
}

/**
 * API keys people add in the app. Each business has its own, encrypted at rest,
 * and they never leave the server: the API only says whether one exists.
 */
export class ProviderKeys extends Context.Service<
  ProviderKeys,
  {
    get(provider: KeyOwner): Effect.Effect<Option.Option<StoredKey>>
    save(provider: KeyOwner, input: ProviderKey): Effect.Effect<void>
    remove(provider: KeyOwner): Effect.Effect<void>
  }
>()("@scope-bot/db/ProviderKeys") {
  static readonly layerMemory = Layer.sync(ProviderKeys, () => {
    const keys = new Map<KeyOwner, StoredKey>()
    return ProviderKeys.of({
      get: (provider) => Effect.sync(() => Option.fromNullishOr(keys.get(provider))),
      save: (provider, input) =>
        Effect.sync(() => {
          keys.set(provider, { key: Redacted.make(input.key), baseUrl: input.baseUrl ?? "" })
        }),
      remove: (provider) =>
        Effect.sync(() => {
          keys.delete(provider)
        })
    })
  })

  static readonly layerPostgres = (secretKey: Redacted.Redacted<string>) =>
    Layer.effect(
      ProviderKeys,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const secret = parseSecret(secretKey)

        return ProviderKeys.of({
          get: (provider) =>
            requireBusiness.pipe(
              Effect.flatMap(
                (business) => sql<{ readonly keyEncrypted: string; readonly baseUrl: string }>`
                  SELECT key_encrypted, base_url FROM provider_keys
                  WHERE business_id = ${business} AND provider = ${provider}`
              ),
              Effect.map((rows) =>
                Option.fromNullishOr(rows[0]).pipe(
                  Option.map((row) => ({
                    key: Redacted.make(decrypt(secret, row.keyEncrypted)),
                    baseUrl: row.baseUrl
                  }))
                )
              ),
              Effect.orDie
            ),
          save: (provider, input) =>
            requireBusiness.pipe(
              Effect.flatMap((business) => {
                const keyEncrypted = encrypt(secret, input.key)
                const baseUrl = input.baseUrl ?? ""
                return sql`INSERT INTO provider_keys ${sql.insert({ businessId: business, provider, keyEncrypted, baseUrl })}
                  ON CONFLICT (business_id, provider) DO UPDATE SET ${sql.update({ keyEncrypted, baseUrl })}`
              }),
              Effect.asVoid,
              Effect.orDie
            ),
          remove: (provider) =>
            requireBusiness.pipe(
              Effect.flatMap(
                (business) => sql`DELETE FROM provider_keys WHERE business_id = ${business} AND provider = ${provider}`
              ),
              Effect.asVoid,
              Effect.orDie
            )
        })
      })
    )
}
