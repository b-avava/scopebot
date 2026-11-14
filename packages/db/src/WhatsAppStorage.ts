import {
  type AgentId,
  type BusinessId,
  defaultWhatsAppSettings,
  type WhatsAppAudience,
  type WhatsAppSettings
} from "@scope-bot/domain"
import { Array as Arr, Context, Effect, Layer, Option, type Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { CurrentBusiness, requireBusiness } from "./CurrentBusiness.ts"
import { decrypt, encrypt, parseSecret } from "./Secrets.ts"

export interface StoredWhatsApp {
  readonly settings: WhatsAppSettings
  /** With a plus. Empty while no number is linked. */
  readonly phone: string | null
  readonly linkedAt: string | null
}

export const unlinkedWhatsApp: StoredWhatsApp = { settings: defaultWhatsAppSettings, phone: null, linkedAt: null }

/** A change to the linked device's keys. Null removes the key. */
export type SessionEntry = readonly [key: string, value: string | null]

/**
 * The WhatsApp number of each business and the keys of its linked device. The
 * keys let anyone read and send as that number, so they are encrypted at rest
 * and never leave the server.
 */
export class WhatsAppStorage extends Context.Service<
  WhatsAppStorage,
  {
    readonly link: Effect.Effect<StoredWhatsApp>
    saveLink(link: StoredWhatsApp): Effect.Effect<void>
    /** Every business with a linked number, so the server can reconnect them when it starts. */
    readonly linkedBusinesses: Effect.Effect<ReadonlyArray<BusinessId>>
    readSession(key: string): Effect.Effect<Option.Option<string>>
    writeSession(entries: ReadonlyArray<SessionEntry>): Effect.Effect<void>
    readonly clearSession: Effect.Effect<void>
  }
>()("@scope-bot/db/WhatsAppStorage") {
  static readonly layerMemory = Layer.sync(WhatsAppStorage, () => {
    const links = new Map<BusinessId | null, StoredWhatsApp>()
    const sessions = new Map<BusinessId | null, Map<string, string>>()
    const sessionOf = (business: BusinessId | null) => {
      const found = sessions.get(business) ?? new Map<string, string>()
      sessions.set(business, found)
      return found
    }

    return WhatsAppStorage.of({
      link: CurrentBusiness.pipe(Effect.map((business) => links.get(business) ?? unlinkedWhatsApp)),
      saveLink: (link) =>
        CurrentBusiness.pipe(
          Effect.flatMap((business) =>
            Effect.sync(() => {
              links.set(business, link)
            })
          )
        ),
      linkedBusinesses: Effect.sync(() =>
        [...links].flatMap(([business, link]) => (business !== null && link.phone !== null ? [business] : []))
      ),
      readSession: (key) =>
        CurrentBusiness.pipe(Effect.map((business) => Option.fromNullishOr(sessionOf(business).get(key)))),
      writeSession: (entries) =>
        CurrentBusiness.pipe(
          Effect.flatMap((business) =>
            Effect.sync(() => {
              const session = sessionOf(business)
              for (const [key, value] of entries) {
                if (value === null) session.delete(key)
                else session.set(key, value)
              }
            })
          )
        ),
      clearSession: CurrentBusiness.pipe(
        Effect.flatMap((business) =>
          Effect.sync(() => {
            sessions.delete(business)
          })
        )
      )
    })
  })

  static readonly layerPostgres = (secretKey: Redacted.Redacted<string>) =>
    Layer.effect(
      WhatsAppStorage,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const secret = parseSecret(secretKey)

        return WhatsAppStorage.of({
          link: requireBusiness.pipe(
            Effect.flatMap(
              (business) => sql<{
                readonly agentId: AgentId | null
                readonly audience: WhatsAppAudience
                readonly answersAlone: boolean
                readonly phone: string | null
                readonly linkedAt: Date | null
              }>`SELECT agent_id, audience, answers_alone, phone, linked_at FROM whatsapp_links
                WHERE business_id = ${business}`
            ),
            Effect.map((rows) => {
              const row = rows[0]
              if (row === undefined) return unlinkedWhatsApp
              return {
                settings: { agentId: row.agentId, audience: row.audience, answersAlone: row.answersAlone },
                phone: row.phone,
                linkedAt: row.linkedAt === null ? null : row.linkedAt.toISOString()
              }
            }),
            Effect.orDie
          ),
          saveLink: ({ settings, phone, linkedAt }) =>
            requireBusiness.pipe(
              Effect.flatMap((business) => {
                const values = { ...settings, phone, linkedAt }
                return sql`INSERT INTO whatsapp_links ${sql.insert({ businessId: business, ...values })}
                  ON CONFLICT (business_id) DO UPDATE SET ${sql.update(values)}`
              }),
              Effect.asVoid,
              Effect.orDie
            ),
          linkedBusinesses: sql<{ readonly businessId: BusinessId }>`
            SELECT business_id FROM whatsapp_links WHERE phone IS NOT NULL`.pipe(
            Effect.map((rows) => rows.map((row) => row.businessId)),
            Effect.orDie
          ),
          readSession: (key) =>
            requireBusiness.pipe(
              Effect.flatMap(
                (business) => sql<{ readonly valueEncrypted: string }>`SELECT value_encrypted FROM whatsapp_session
                  WHERE business_id = ${business} AND key = ${key}`
              ),
              Effect.map((rows) =>
                Option.fromNullishOr(rows[0]).pipe(Option.map((row) => decrypt(secret, row.valueEncrypted)))
              ),
              Effect.orDie
            ),
          writeSession: (entries) =>
            requireBusiness.pipe(
              Effect.flatMap((business) => {
                // One statement cannot write the same key twice, so the last change wins.
                const latest = [...new Map(entries).entries()]
                const removed = latest.flatMap(([key, value]) => (value === null ? [key] : []))
                const saved: Array<Record<string, unknown>> = latest.flatMap(([key, value]) =>
                  value === null ? [] : [{ businessId: business, key, valueEncrypted: encrypt(secret, value) }]
                )
                return sql.withTransaction(
                  Effect.all([
                    removed.length === 0
                      ? Effect.void
                      : sql`DELETE FROM whatsapp_session WHERE business_id = ${business} AND key IN ${sql.in(removed)}`,
                    !Arr.isReadonlyArrayNonEmpty(saved)
                      ? Effect.void
                      : sql`INSERT INTO whatsapp_session ${sql.insert(saved)}
                          ON CONFLICT (business_id, key) DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted`
                  ])
                )
              }),
              Effect.asVoid,
              Effect.orDie
            ),
          clearSession: requireBusiness.pipe(
            Effect.flatMap((business) => sql`DELETE FROM whatsapp_session WHERE business_id = ${business}`),
            Effect.asVoid,
            Effect.orDie
          )
        })
      })
    )
}
