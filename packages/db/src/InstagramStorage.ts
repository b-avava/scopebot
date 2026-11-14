import {
  type AgentId,
  type BusinessId,
  type ChannelAudience,
  type ChannelSettings,
  defaultChannelSettings,
  type InstagramAccount
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { CurrentBusiness, requireBusiness } from "./CurrentBusiness.ts"
import { decrypt, encrypt, parseSecret } from "./Secrets.ts"

export interface StoredInstagram {
  readonly settings: ChannelSettings
  readonly token: Redacted.Redacted<string> | null
  /** Instagram's tokens last 60 days unless they are refreshed. */
  readonly tokenExpiresAt: string | null
  /** The professional account's id, which every message from Instagram names. */
  readonly accountId: string | null
  readonly account: InstagramAccount | null
  readonly connectedAt: string | null
}

interface Row {
  readonly agentId: AgentId | null
  readonly audience: ChannelAudience
  readonly answersAlone: boolean
  readonly tokenEncrypted: string | null
  readonly tokenExpiresAt: Date | null
  readonly accountId: string | null
  readonly username: string | null
  readonly name: string | null
  readonly connectedAt: Date | null
}

const iso = (value: Date | null) => (value === null ? null : value.toISOString())

const fromRow = (secret: Buffer, row: Row): StoredInstagram => ({
  settings: { agentId: row.agentId, audience: row.audience, answersAlone: row.answersAlone },
  token: row.tokenEncrypted === null ? null : Redacted.make(decrypt(secret, row.tokenEncrypted)),
  tokenExpiresAt: iso(row.tokenExpiresAt),
  accountId: row.accountId,
  account: row.username === null ? null : { username: row.username, name: row.name ?? row.username },
  connectedAt: iso(row.connectedAt)
})

export const disconnectedInstagram: StoredInstagram = {
  settings: defaultChannelSettings,
  token: null,
  tokenExpiresAt: null,
  accountId: null,
  account: null,
  connectedAt: null
}

/** The Instagram account of each business. The token lets anyone write as it, so it is encrypted at rest. */
export class InstagramStorage extends Context.Service<
  InstagramStorage,
  {
    readonly link: Effect.Effect<StoredInstagram>
    saveLink(link: StoredInstagram): Effect.Effect<void>
    /** Which business an account belongs to, so a message from Instagram reaches the right one. */
    businessForAccount(accountId: string): Effect.Effect<Option.Option<BusinessId>>
    readonly connectedBusinesses: Effect.Effect<ReadonlyArray<BusinessId>>
  }
>()("@scope-bot/db/InstagramStorage") {
  static readonly layerMemory = Layer.sync(InstagramStorage, () => {
    const links = new Map<BusinessId | null, StoredInstagram>()
    return InstagramStorage.of({
      link: CurrentBusiness.pipe(Effect.map((business) => links.get(business) ?? disconnectedInstagram)),
      saveLink: (link) =>
        CurrentBusiness.pipe(
          Effect.flatMap((business) =>
            Effect.sync(() => {
              links.set(business, link)
            })
          )
        ),
      businessForAccount: (accountId) =>
        Effect.sync(() =>
          Option.fromNullishOr(
            [...links].find(
              ([business, link]) => business !== null && link.accountId === accountId && link.token !== null
            )?.[0] ?? null
          )
        ),
      connectedBusinesses: Effect.sync(() =>
        [...links].flatMap(([business, link]) => (business !== null && link.token !== null ? [business] : []))
      )
    })
  })

  static readonly layerPostgres = (secretKey: Redacted.Redacted<string>) =>
    Layer.effect(
      InstagramStorage,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const secret = parseSecret(secretKey)

        return InstagramStorage.of({
          link: requireBusiness.pipe(
            Effect.flatMap(
              (
                business
              ) => sql<Row>`SELECT agent_id, audience, answers_alone, token_encrypted, token_expires_at, account_id, username,
                  name, connected_at
                FROM instagram_links WHERE business_id = ${business}`
            ),
            Effect.map((rows) => (rows[0] === undefined ? disconnectedInstagram : fromRow(secret, rows[0]))),
            Effect.orDie
          ),
          saveLink: (link) =>
            requireBusiness.pipe(
              Effect.flatMap((business) => {
                const values = {
                  ...link.settings,
                  tokenEncrypted: link.token === null ? null : encrypt(secret, Redacted.value(link.token)),
                  tokenExpiresAt: link.tokenExpiresAt,
                  accountId: link.accountId,
                  username: link.account?.username ?? null,
                  name: link.account?.name ?? null,
                  connectedAt: link.connectedAt
                }
                return sql`INSERT INTO instagram_links ${sql.insert({ businessId: business, ...values })}
                  ON CONFLICT (business_id) DO UPDATE SET ${sql.update(values)}`
              }),
              Effect.asVoid,
              Effect.orDie
            ),
          businessForAccount: (accountId) =>
            sql<{ readonly businessId: BusinessId }>`
              SELECT business_id FROM instagram_links WHERE account_id = ${accountId} AND token_encrypted IS NOT NULL`.pipe(
              Effect.map((rows) => Option.fromNullishOr(rows[0]?.businessId)),
              Effect.orDie
            ),
          connectedBusinesses: sql<{ readonly businessId: BusinessId }>`
            SELECT business_id FROM instagram_links WHERE token_encrypted IS NOT NULL`.pipe(
            Effect.map((rows) => rows.map((row) => row.businessId)),
            Effect.orDie
          )
        })
      })
    )
}
