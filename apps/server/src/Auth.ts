import { createHash, randomBytes } from "node:crypto"
import { Deals } from "@scope-bot/agents"
import type { CurrentSession } from "@scope-bot/contracts"
import { Accounts, CurrentBusiness, type NewUser } from "@scope-bot/db"
import {
  type Account,
  type AuthSession,
  BusinessId,
  type ChangePassword,
  EmailTaken,
  Forbidden,
  type Invite,
  InviteInvalid,
  type JoinTeam,
  type Login,
  type NewInvite,
  type Register,
  TooManyAttempts,
  Unauthorized,
  type User,
  UserId,
  UserNotFound,
  WrongCredentials
} from "@scope-bot/domain"
import { Clock, Context, Effect, Layer, Option } from "effect"
import { hashPassword, verifyPassword } from "./Passwords.ts"

const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_MS = 30 * DAY_MS
const INVITE_MS = 7 * DAY_MS
/** A session is extended at most this often, so reading does not write on every request. */
const EXTEND_AFTER_MS = 60 * 60 * 1000
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const SECRET_BYTES = 32

const newSecret = () => randomBytes(SECRET_BYTES).toString("base64url")

/** Tokens are long and random, so a plain hash is enough. A stolen database then holds no usable session. */
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex")

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const dateIn = (millis: number) => Clock.currentTimeMillis.pipe(Effect.map((now) => new Date(now + millis)))

const canManageTeam = (user: User) => user.role === "owner" || user.role === "admin"

/** Accounts, sessions and the team. The API calls this before anything else runs. */
export class Auth extends Context.Service<
  Auth,
  {
    register(input: Register): Effect.Effect<AuthSession, EmailTaken>
    login(input: Login): Effect.Effect<AuthSession, WrongCredentials | TooManyAttempts>
    join(input: JoinTeam): Effect.Effect<AuthSession, EmailTaken | InviteInvalid>
    verify(token: string): Effect.Effect<Account, Unauthorized>
    logout(session: CurrentSession["Service"]): Effect.Effect<void>
    /** Signs out every other device, in case the old password leaked. */
    changePassword(session: CurrentSession["Service"], input: ChangePassword): Effect.Effect<void, WrongCredentials>
    team(session: CurrentSession["Service"]): Effect.Effect<ReadonlyArray<User>>
    invite(session: CurrentSession["Service"], input: NewInvite): Effect.Effect<Invite, Forbidden>
    removeMember(session: CurrentSession["Service"], id: UserId): Effect.Effect<void, Forbidden | UserNotFound>
  }
>()("@scope-bot/server/Auth") {
  static readonly layer = Layer.effect(
    Auth,
    Effect.gen(function* () {
      const accounts = yield* Accounts
      const deals = yield* Deals
      // Hashed once, so a login for an unknown email takes as long as a wrong password.
      const decoyHash = yield* hashPassword(newSecret())

      const openSession = Effect.fn("Auth.openSession")(function* (account: Account) {
        const token = newSecret()
        yield* accounts.createSession(hashSecret(token), account.user.id, yield* dateIn(SESSION_MS))
        return { token, account }
      })

      const accountOf = (id: UserId) =>
        accounts.findAccount(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.die("A user that was just saved is gone"),
              onSome: ({ account }) => Effect.succeed(account)
            })
          )
        )

      return Auth.of({
        register: Effect.fn("Auth.register")(function* (input) {
          const user: NewUser = {
            id: UserId.make(crypto.randomUUID()),
            businessId: BusinessId.make(crypto.randomUUID()),
            email: normalizeEmail(input.email),
            name: input.name.trim(),
            passwordHash: yield* hashPassword(input.password),
            role: "owner"
          }
          if (!(yield* accounts.createBusiness(user, input.businessName.trim()))) {
            return yield* Effect.fail(new EmailTaken())
          }
          yield* deals.pipelines.pipe(Effect.provideService(CurrentBusiness, user.businessId))
          return yield* openSession(yield* accountOf(user.id))
        }),
        login: Effect.fn("Auth.login")(function* (input) {
          const email = normalizeEmail(input.email)
          const since = yield* dateIn(-FAILURE_WINDOW_MS)
          if ((yield* accounts.recentFailures(email, since)) >= MAX_FAILURES) {
            return yield* Effect.fail(new TooManyAttempts())
          }
          const found = yield* accounts.findLogin(email)
          const stored = Option.match(found, { onNone: () => decoyHash, onSome: (login) => login.passwordHash })
          const matches = yield* verifyPassword(input.password, stored)
          if (Option.isNone(found) || !matches) {
            yield* accounts.recordFailure(email)
            return yield* Effect.fail(new WrongCredentials())
          }
          yield* accounts.clearFailures(email)
          return yield* openSession(found.value.account)
        }),
        join: Effect.fn("Auth.join")(function* (input) {
          const email = normalizeEmail(input.email)
          // Checked first, so a taken email does not spend the invite.
          if (Option.isSome(yield* accounts.findLogin(email))) return yield* Effect.fail(new EmailTaken())
          const passwordHash = yield* hashPassword(input.password)
          const invite = yield* accounts.spendInvite(hashSecret(input.code.trim()))
          if (Option.isNone(invite)) return yield* Effect.fail(new InviteInvalid())
          const id = UserId.make(crypto.randomUUID())
          const created = yield* accounts.createUser({
            id,
            businessId: invite.value.businessId,
            email,
            name: input.name.trim(),
            passwordHash,
            role: invite.value.role
          })
          if (!created) return yield* Effect.fail(new EmailTaken())
          return yield* openSession(yield* accountOf(id))
        }),
        verify: Effect.fn("Auth.verify")(function* (token) {
          const tokenHash = hashSecret(token)
          const found = yield* accounts.findSession(tokenHash)
          if (Option.isNone(found)) return yield* Effect.fail(new Unauthorized())
          const now = yield* Clock.currentTimeMillis
          if (now - found.value.lastUsedAt.getTime() > EXTEND_AFTER_MS) {
            yield* accounts.extendSession(tokenHash, new Date(now + SESSION_MS))
          }
          return found.value.account
        }),
        logout: (session) => accounts.removeSession(hashSecret(session.token)),
        changePassword: Effect.fn("Auth.changePassword")(function* (session, input) {
          const id = session.account.user.id
          const found = yield* accounts.findAccount(id)
          if (Option.isNone(found)) return yield* Effect.fail(new WrongCredentials())
          if (!(yield* verifyPassword(input.current, found.value.passwordHash))) {
            return yield* Effect.fail(new WrongCredentials())
          }
          yield* accounts.savePassword(id, yield* hashPassword(input.next))
          yield* accounts.removeOtherSessions(id, hashSecret(session.token))
        }),
        team: (session) => accounts.members(session.account.businessId),
        invite: Effect.fn("Auth.invite")(function* (session, input) {
          if (!canManageTeam(session.account.user)) return yield* Effect.fail(new Forbidden())
          const code = newSecret()
          const expiresAt = yield* dateIn(INVITE_MS)
          yield* accounts.createInvite(
            hashSecret(code),
            session.account.businessId,
            input.role,
            session.account.user.id,
            expiresAt
          )
          return { code, role: input.role, expiresAt: expiresAt.toISOString() }
        }),
        removeMember: Effect.fn("Auth.removeMember")(function* (session, id) {
          const { user, businessId } = session.account
          if (!canManageTeam(user) || user.id === id) return yield* Effect.fail(new Forbidden())
          const member = yield* accounts.findMember(businessId, id)
          if (Option.isNone(member)) return yield* Effect.fail(new UserNotFound())
          if (member.value.role === "owner") return yield* Effect.fail(new Forbidden())
          yield* accounts.removeMember(businessId, id)
        })
      })
    })
  )
}
