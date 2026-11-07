import type { ProviderId, ProviderKey } from "@scope-bot/domain"
import { Context, Effect, FileSystem, Layer, Option, Path, Redacted, Schema, Semaphore } from "effect"

const Keys = Schema.Record(Schema.String, Schema.Struct({ key: Schema.String, baseUrl: Schema.String }))
type Keys = typeof Keys.Type

const decodeKeys = Schema.decodeUnknownEffect(Schema.fromJsonString(Keys))

export interface StoredKey {
  readonly key: Redacted.Redacted<string>
  /** Empty uses the provider's own address. */
  readonly baseUrl: string
}

const make = (initial: Keys, persist: (keys: Keys) => Effect.Effect<void>) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1)
    let keys = initial

    const update = (change: (current: Keys) => Keys) =>
      Semaphore.withPermit(
        lock,
        Effect.suspend(() => {
          const next = change(keys)
          return persist(next).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                keys = next
              })
            )
          )
        })
      )

    return ProviderKeys.of({
      get: (provider) =>
        Effect.sync(() =>
          Option.fromNullishOr(keys[provider]).pipe(
            Option.map((stored) => ({ key: Redacted.make(stored.key), baseUrl: stored.baseUrl }))
          )
        ),
      save: (provider, input) =>
        update((current) => ({ ...current, [provider]: { key: input.key, baseUrl: input.baseUrl ?? "" } })),
      remove: (provider) =>
        update((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== provider)))
    })
  })

/**
 * API keys people add in the app. They live in their own file, as plainly as
 * `.env`, and never leave the server: the API only says whether one exists.
 */
export class ProviderKeys extends Context.Service<
  ProviderKeys,
  {
    get(provider: ProviderId): Effect.Effect<Option.Option<StoredKey>>
    save(provider: ProviderId, input: ProviderKey): Effect.Effect<void>
    remove(provider: ProviderId): Effect.Effect<void>
  }
>()("@scope-bot/db/ProviderKeys") {
  static readonly layerMemory = Layer.effect(
    ProviderKeys,
    Effect.suspend(() => make({}, () => Effect.void))
  )

  static readonly layerFile = (filePath: string) =>
    Layer.effect(
      ProviderKeys,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path

        yield* fs.makeDirectory(path.dirname(filePath), { recursive: true })

        const initial = (yield* fs.exists(filePath))
          ? yield* fs.readFileString(filePath).pipe(Effect.flatMap(decodeKeys))
          : {}

        const temporaryPath = `${filePath}.tmp`
        const persist = (keys: Keys) =>
          fs.writeFileString(temporaryPath, JSON.stringify(keys)).pipe(
            // Windows ignores this, so the folder's own permissions protect the file there.
            Effect.andThen(fs.chmod(temporaryPath, 0o600).pipe(Effect.ignore)),
            Effect.andThen(fs.rename(temporaryPath, filePath)),
            Effect.orDie
          )

        return yield* make(initial, persist)
      }).pipe(Effect.orDie)
    )
}
