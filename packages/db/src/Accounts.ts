import {
  type Account,
  Account as AccountSchema,
  type BusinessId,
  type User,
  type UserId,
  User as UserSchema
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

type Row = Record<string, unknown>

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value)

const toUser = (row: Row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  createdAt: iso(row.createdAt)
})

const decodeUsers = Schema.decodeUnknownEffect(Schema.Array(UserSchema))
const decodeAccount = Schema.decodeUnknownEffect(AccountSchema)

const toAccount = (row: Row) =>
  decodeAccount({ user: toUser(row), businessId: row.businessId, businessName: row.businessName }).pipe(Effect.orDie)

export interface NewUser {
  readonly id: UserId
  readonly businessId: BusinessId
  readonly email: string
  readonly name: string
  readonly passwordHash: string
  readonly role: User["role"]
}

export interface StoredLogin {
  readonly account: Account
  readonly passwordHash: string
}

export interface FoundSession {
  readonly account: Account
  readonly lastUsedAt: Date
}

const accountColumns = `u.id, u.email, u.name, u.role, u.created_at, u.business_id, u.password_hash, b.name AS business_name`

/**
 * Users, sessions and invites. These tables work across businesses, because
 * signing in happens before anyone knows the business. Secrets arrive here
 * already hashed.
 */
export class Accounts extends Context.Service<
  Accounts,
  {
    /** False when the email is taken, and then nothing is created. */
    createBusiness(user: NewUser, businessName: string): Effect.Effect<boolean>
    /** False when the email is taken. */
    createUser(user: NewUser): Effect.Effect<boolean>
    findLogin(email: string): Effect.Effect<Option.Option<StoredLogin>>
    findAccount(id: UserId): Effect.Effect<Option.Option<StoredLogin>>
    savePassword(id: UserId, passwordHash: string): Effect.Effect<void>
    createSession(tokenHash: string, id: UserId, expiresAt: Date): Effect.Effect<void>
    findSession(tokenHash: string): Effect.Effect<Option.Option<FoundSession>>
    extendSession(tokenHash: string, expiresAt: Date): Effect.Effect<void>
    removeSession(tokenHash: string): Effect.Effect<void>
    /** Signs the user out everywhere, except for the session given. */
    removeOtherSessions(id: UserId, keptTokenHash: string | null): Effect.Effect<void>
    recentFailures(email: string, since: Date): Effect.Effect<number>
    recordFailure(email: string): Effect.Effect<void>
    clearFailures(email: string): Effect.Effect<void>
    members(business: BusinessId): Effect.Effect<ReadonlyArray<User>>
    /** Only inside the business, so an id from another one finds nothing. */
    findMember(business: BusinessId, id: UserId): Effect.Effect<Option.Option<User>>
    removeMember(business: BusinessId, id: UserId): Effect.Effect<void>
    createInvite(
      tokenHash: string,
      business: BusinessId,
      role: "admin" | "member",
      createdBy: UserId,
      expiresAt: Date
    ): Effect.Effect<void>
    /** Spends the invite. Two people cannot use one code. */
    spendInvite(
      tokenHash: string
    ): Effect.Effect<Option.Option<{ readonly businessId: BusinessId; readonly role: "admin" | "member" }>>
  }
>()("@scope-bot/db/Accounts") {
  static readonly layer = Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const insertUser = (user: NewUser) =>
        sql<Row>`INSERT INTO users ${sql.insert({ ...user })} ON CONFLICT (email) DO NOTHING RETURNING id`.pipe(
          Effect.map((rows) => rows.length === 1)
        )

      const login = (rows: ReadonlyArray<Row>) => {
        const row = rows[0]
        if (row === undefined) return Effect.succeed(Option.none<StoredLogin>())
        return toAccount(row).pipe(
          Effect.map((account) => Option.some({ account, passwordHash: String(row.passwordHash) }))
        )
      }

      return Accounts.of({
        createBusiness: (user, businessName) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`INSERT INTO businesses ${sql.insert({ id: user.businessId, name: businessName })}`
                const created = yield* insertUser(user)
                // Rolling back also removes the business, so nothing is left without an owner.
                return created ? true : yield* Effect.fail("email-taken" as const)
              })
            )
            .pipe(
              Effect.catchIf(
                (failure) => failure === "email-taken",
                () => Effect.succeed(false)
              ),
              Effect.orDie
            ),
        createUser: (user) => insertUser(user).pipe(Effect.orDie),
        findLogin: (email) =>
          sql<Row>`SELECT ${sql.literal(accountColumns)} FROM users u JOIN businesses b ON b.id = u.business_id
            WHERE u.email = ${email}`.pipe(Effect.flatMap(login), Effect.orDie),
        findAccount: (id) =>
          sql<Row>`SELECT ${sql.literal(accountColumns)} FROM users u JOIN businesses b ON b.id = u.business_id
            WHERE u.id = ${id}`.pipe(Effect.flatMap(login), Effect.orDie),
        savePassword: (id, passwordHash) =>
          sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${id}`.pipe(Effect.asVoid, Effect.orDie),
        createSession: (tokenHash, id, expiresAt) =>
          sql`DELETE FROM sessions WHERE expires_at < now()`.pipe(
            Effect.andThen(sql`INSERT INTO sessions ${sql.insert({ tokenHash, userId: id, expiresAt })}`),
            Effect.asVoid,
            Effect.orDie
          ),
        findSession: (tokenHash) =>
          sql<Row>`SELECT ${sql.literal(accountColumns)}, s.last_used_at FROM sessions s
            JOIN users u ON u.id = s.user_id JOIN businesses b ON b.id = u.business_id
            WHERE s.token_hash = ${tokenHash} AND s.expires_at > now()`.pipe(
            Effect.flatMap((rows) => {
              const row = rows[0]
              if (row === undefined) return Effect.succeed(Option.none<FoundSession>())
              return toAccount(row).pipe(
                Effect.map((account) => Option.some({ account, lastUsedAt: row.lastUsedAt as Date }))
              )
            }),
            Effect.orDie
          ),
        extendSession: (tokenHash, expiresAt) =>
          sql`UPDATE sessions SET last_used_at = now(), expires_at = ${expiresAt} WHERE token_hash = ${tokenHash}`.pipe(
            Effect.asVoid,
            Effect.orDie
          ),
        removeSession: (tokenHash) =>
          sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`.pipe(Effect.asVoid, Effect.orDie),
        removeOtherSessions: (id, keptTokenHash) =>
          sql`DELETE FROM sessions WHERE user_id = ${id} AND token_hash IS DISTINCT FROM ${keptTokenHash}`.pipe(
            Effect.asVoid,
            Effect.orDie
          ),
        recentFailures: (email, since) =>
          sql<Row>`SELECT count(*)::int AS failures FROM login_failures WHERE email = ${email} AND failed_at > ${since}`.pipe(
            Effect.map((rows) => Number(rows[0]?.failures ?? 0)),
            Effect.orDie
          ),
        recordFailure: (email) =>
          sql`DELETE FROM login_failures WHERE failed_at < now() - interval '1 day'`.pipe(
            Effect.andThen(sql`INSERT INTO login_failures ${sql.insert({ email })}`),
            Effect.asVoid,
            Effect.orDie
          ),
        clearFailures: (email) =>
          sql`DELETE FROM login_failures WHERE email = ${email}`.pipe(Effect.asVoid, Effect.orDie),
        members: (business) =>
          sql<Row>`SELECT * FROM users WHERE business_id = ${business} ORDER BY seq`.pipe(
            Effect.flatMap((rows) => decodeUsers(rows.map(toUser))),
            Effect.orDie
          ),
        findMember: (business, id) =>
          sql<Row>`SELECT * FROM users WHERE business_id = ${business} AND id = ${id}`.pipe(
            Effect.flatMap((rows) => decodeUsers(rows.map(toUser))),
            Effect.map((users) => Option.fromNullishOr(users[0])),
            Effect.orDie
          ),
        removeMember: (business, id) =>
          sql`DELETE FROM users WHERE business_id = ${business} AND id = ${id}`.pipe(Effect.asVoid, Effect.orDie),
        createInvite: (tokenHash, business, role, createdBy, expiresAt) =>
          sql`INSERT INTO invites ${sql.insert({ tokenHash, businessId: business, role, createdBy, expiresAt })}`.pipe(
            Effect.asVoid,
            Effect.orDie
          ),
        spendInvite: (tokenHash) =>
          sql<Row>`UPDATE invites SET used_at = now()
            WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
            RETURNING business_id, role`.pipe(
            Effect.map((rows) =>
              Option.fromNullishOr(rows[0]).pipe(
                Option.map((row) => ({
                  businessId: row.businessId as BusinessId,
                  role: row.role as "admin" | "member"
                }))
              )
            ),
            Effect.orDie
          )
      })
    })
  )
}
