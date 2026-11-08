import {
  type AgentId,
  type BusinessId,
  type ChannelAudience,
  type ChannelSettings,
  defaultChannelSettings,
  type TelegramBot
} from "@scope-bot/domain"
import { Context, Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { CurrentBusiness, requireBusiness } from "./CurrentBusiness.ts"
import { decrypt, encrypt, parseSecret } from "./Secrets.ts"

/** The Telegram Business account the bot answers for, as Telegram last described it. */
export interface StoredBusinessAccount {
  /** The id replies have to name. */
  readonly connectionId: string
  /** The owner. Their own messages in those chats are not the customer's. */
  readonly userId: string
  readonly name: string
  readonly username: string
  readonly enabled: boolean
}

export interface StoredTelegram {
  readonly settings: ChannelSettings
  readonly token: Redacted.Redacted<string> | null
  readonly bot: TelegramBot | null
  readonly connectedAt: string | null
  /** The next update to ask Telegram for, so none is handled twice after a restart. */
  readonly offset: number
  readonly business: StoredBusinessAccount | null
}

export const disconnectedTelegram: StoredTelegram = {
  settings: defaultChannelSettings,
  token: null,
  bot: null,
  connectedAt: null,
  offset: 0,
  business: null
}

/** The bot of each business. The token lets anyone write as the bot, so it is encrypted at rest. */
export class TelegramStorage extends Context.Service<
  TelegramStorage,
  {
    readonly link: Effect.Effect<StoredTelegram>
    saveLink(link: StoredTelegram): Effect.Effect<void>
    /** Every business with a bot, so the server can start listening when it starts. */
    readonly connectedBusinesses: Effect.Effect<ReadonlyArray<BusinessId>>
  }
>()("@scope-bot/db/TelegramStorage") {
  static readonly layerMemory = Layer.sync(TelegramStorage, () => {
    const links = new Map<BusinessId | null, StoredTelegram>()
    return TelegramStorage.of({
      link: CurrentBusiness.pipe(Effect.map((business) => links.get(business) ?? disconnectedTelegram)),
      saveLink: (link) =>
        CurrentBusiness.pipe(
          Effect.flatMap((business) =>
            Effect.sync(() => {
              links.set(business, link)
            })
          )
        ),
      connectedBusinesses: Effect.sync(() =>
        [...links].flatMap(([business, link]) => (business !== null && link.token !== null ? [business] : []))
      )
    })
  })

  static readonly layerPostgres = (secretKey: Redacted.Redacted<string>) =>
    Layer.effect(
      TelegramStorage,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const secret = parseSecret(secretKey)

        return TelegramStorage.of({
          link: requireBusiness.pipe(
            Effect.flatMap(
              (business) => sql<{
                readonly agentId: AgentId | null
                readonly audience: ChannelAudience
                readonly answersAlone: boolean
                readonly tokenEncrypted: string | null
                readonly botUsername: string | null
                readonly botName: string | null
                readonly connectedAt: Date | null
                readonly updateOffset: string | number
                readonly businessAccount: StoredBusinessAccount | null
              }>`SELECT agent_id, audience, answers_alone, token_encrypted, bot_username, bot_name, connected_at,
                  update_offset, business_account
                FROM telegram_links WHERE business_id = ${business}`
            ),
            Effect.map((rows): StoredTelegram => {
              const row = rows[0]
              if (row === undefined) return disconnectedTelegram
              return {
                settings: { agentId: row.agentId, audience: row.audience, answersAlone: row.answersAlone },
                token: row.tokenEncrypted === null ? null : Redacted.make(decrypt(secret, row.tokenEncrypted)),
                bot:
                  row.botUsername === null ? null : { username: row.botUsername, name: row.botName ?? row.botUsername },
                connectedAt: row.connectedAt === null ? null : row.connectedAt.toISOString(),
                offset: Number(row.updateOffset),
                business: row.businessAccount
              }
            }),
            Effect.orDie
          ),
          saveLink: (link) =>
            requireBusiness.pipe(
              Effect.flatMap((business) => {
                const values = {
                  ...link.settings,
                  tokenEncrypted: link.token === null ? null : encrypt(secret, Redacted.value(link.token)),
                  botUsername: link.bot?.username ?? null,
                  botName: link.bot?.name ?? null,
                  connectedAt: link.connectedAt,
                  updateOffset: link.offset,
                  businessAccount: link.business === null ? null : JSON.stringify(link.business)
                }
                return sql`INSERT INTO telegram_links ${sql.insert({ businessId: business, ...values })}
                  ON CONFLICT (business_id) DO UPDATE SET ${sql.update(values)}`
              }),
              Effect.asVoid,
              Effect.orDie
            ),
          connectedBusinesses: sql<{ readonly businessId: BusinessId }>`
            SELECT business_id FROM telegram_links WHERE token_encrypted IS NOT NULL`.pipe(
            Effect.map((rows) => rows.map((row) => row.businessId)),
            Effect.orDie
          )
        })
      })
    )
}
