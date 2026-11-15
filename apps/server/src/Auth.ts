import { createHash, randomBytes } from "node:crypto"
import { Deals } from "@scope-bot/agents"
import type { CurrentSession } from "@scope-bot/contracts"
import { Accounts, CurrentBusiness, type NewUser } from "@scope-bot/db"
import {
  type Account,
  type AuthOptions,
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
  normalizeEmail,
  type Register,
  SetupCodeInvalid,
  SignupClosed,
  TooManyAttempts,
  Unauthorized,
  type User,
  UserId,
  UserNotFound,
  WrongCredentials
} from "@scope-bot/domain"
import { Clock, Context, Effect, Layer, Option, Ref, Semaphore } from "effect"
import { hashPassword, verifyPassword } from "./Passwords.ts"
import { Signup, sameSetupCode } from "./Signup.ts"

const DAY_MS = 24 * 60 * 60 * 1000
/** A session ends this long after its last use. */
export const SESSION_MS = 30 * DAY_MS
const INVITE_MS = 7 * DAY_MS
/** A session is extended at most this often, so reading does not write on every request. */
const EXTEND_AFTER_MS = 60 * 60 * 1000
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const SECRET_BYTES = 32

const newSecret = () => randomBytes(SECRET_BYTES).toString("base64url")

/** Tokens are long and random, so a plain hash is enough. A stolen database then holds no usable session. */
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex")

const dateIn = (millis: number) => Clock.currentTimeMillis.pipe(Effect.map((now) => new Date(now + millis)))

const canManageTeam = (user: User) => user.role === "owner" || user.role === "admin"

/** Accounts, sessions and the team. The API calls this before anything else runs. */
export class Auth extends Context.Service<
  Auth,
  {
    options: Effect.Effect<AuthOptions>
    /** Creates a business and its owner: the first one with the setup code, others only while sign-up is open. */
    register(input: Register): Effect.Effect<AuthSession, EmailTaken | SignupClosed | SetupCodeInvalid>
    login(input: Login): Effect.Effect<AuthSession, WrongCredentials | TooManyAttempts>
    join(input: JoinTeam): Effect.Effect<AuthSession, EmailTaken | InviteInvalid>
    /** `extendedUntil` is set when this check moved the end of the session, so a cookie can follow it. */
    verify(
      token: string
    ): Effect.Effect<{ readonly account: Account; readonly extendedUntil: Date | null }, Unauthorized>
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
      const signup = yield* Signup
      // Hashed once, so a login for an unknown email takes as long as a wrong password.
      const decoyHash = yield* hashPassword(newSecret())

      // Only whoever reads the log of a new server can create its first business (ADR 0028).
      const setupCode = yield* Ref.make(Option.none<string>())
      const setupLock = yield* Semaphore.make(1)
      if (signup.open) {
        yield* Effect.logWarning("Sign-up is open: anyone who reaches this server can create a business on it.")
      } else if (!(yield* accounts.hasBusiness)) {
        const code = yield* signup.newSetupCode
        yield* Ref.set(setupCode, Option.some(code))
        yield* Effect.logWarning(
          `This server is not set up yet. Open Scope Bot and create the owner with the setup code ${code}`
        )
      }

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

      const createOwner = Effect.fn("Auth.createOwner")(function* (input: Register) {
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
      })

      /** One at a time, so two people with the code cannot both become the first owner. */
      const setUp = Effect.fn("Auth.setUp")(function* (input: Register) {
        if (yield* accounts.hasBusiness) return yield* Effect.fail(new SignupClosed())
        const expected = yield* Ref.get(setupCode)
        if (Option.isNone(expected) || !sameSetupCode(input.setupCode ?? "", expected.value)) {
          return yield* Effect.fail(new SetupCodeInvalid())
        }
        const session = yield* createOwner(input)
        yield* Ref.set(setupCode, Option.none())
        return session
      })

      return Auth.of({
        options: accounts.hasBusiness.pipe(
          Effect.map((hasBusiness) => ({ needsSetup: !hasBusiness, signupOpen: signup.open }))
        ),
        register: (input) => (signup.open ? createOwner(input) : setupLock.withPermits(1)(setUp(input))),
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
          if (now - found.value.lastUsedAt.getTime() <= EXTEND_AFTER_MS) {
            return { account: found.value.account, extendedUntil: null }
          }
          const extendedUntil = new Date(now + SESSION_MS)
          yield* accounts.extendSession(tokenHash, extendedUntil)
          return { account: found.value.account, extendedUntil }
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
