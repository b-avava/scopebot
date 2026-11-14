import { Schema } from "effect"

export const BusinessId = Schema.String.pipe(Schema.brand("BusinessId"))
export type BusinessId = typeof BusinessId.Type

export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

/** The owner created the business. Owners and admins manage the team, members only work in it. */
export const UserRole = Schema.Literals(["owner", "admin", "member"])
export type UserRole = typeof UserRole.Type

export const MIN_PASSWORD_LENGTH = 10
const MAX_PASSWORD_LENGTH = 200

const Email = Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/), Schema.isMaxLength(254))
const NewPassword = Schema.String.check(
  Schema.isMinLength(MIN_PASSWORD_LENGTH),
  Schema.isMaxLength(MAX_PASSWORD_LENGTH)
)

/** A human who signs in. Employees in the app are agents, not users. */
export const User = Schema.Struct({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  role: UserRole,
  createdAt: Schema.String
})
export type User = typeof User.Type

/** Who is signed in, and where. */
export const Account = Schema.Struct({
  user: User,
  businessId: BusinessId,
  businessName: Schema.String
})
export type Account = typeof Account.Type

/** The token goes to the client once. The server keeps only its hash. */
export const AuthSession = Schema.Struct({
  token: Schema.String,
  account: Account
})
export type AuthSession = typeof AuthSession.Type

export const Register = Schema.Struct({
  businessName: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  email: Email,
  password: NewPassword
})
export type Register = typeof Register.Type

export const Login = Schema.Struct({
  email: Schema.String,
  password: Schema.String
})
export type Login = typeof Login.Type

/** Joins the business that made the invite. */
export const JoinTeam = Schema.Struct({
  code: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  email: Email,
  password: NewPassword
})
export type JoinTeam = typeof JoinTeam.Type

export const ChangePassword = Schema.Struct({
  current: Schema.String,
  next: NewPassword
})
export type ChangePassword = typeof ChangePassword.Type

export const NewInvite = Schema.Struct({
  role: Schema.Literals(["admin", "member"])
})
export type NewInvite = typeof NewInvite.Type

/** The code is shown once, and works once. */
export const Invite = Schema.Struct({
  code: Schema.String,
  role: UserRole,
  expiresAt: Schema.String
})
export type Invite = typeof Invite.Type

/** No valid session. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}

/** The same answer for a wrong email and a wrong password, so nobody can test who has an account. */
export class WrongCredentials extends Schema.TaggedError<WrongCredentials>()(
  "WrongCredentials",
  {},
  { httpApiStatus: 401 }
) {}

export class TooManyAttempts extends Schema.TaggedError<TooManyAttempts>()(
  "TooManyAttempts",
  {},
  { httpApiStatus: 429 }
) {}

export class EmailTaken extends Schema.TaggedError<EmailTaken>()("EmailTaken", {}, { httpApiStatus: 409 }) {}

/** Signed in, but this role may not do it. */
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {}, { httpApiStatus: 403 }) {}

/** Unknown, expired or already used. */
export class InviteInvalid extends Schema.TaggedError<InviteInvalid>()("InviteInvalid", {}, { httpApiStatus: 410 }) {}

export class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {}, { httpApiStatus: 404 }) {}
