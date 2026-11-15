import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { Config, Context, Effect, Layer } from "effect"

/** No 0, O, 1 or I, so the code survives being read off a screen and typed again. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const GROUPS = 3
const GROUP_LENGTH = 4

/** Twelve characters of 32 kinds: 60 random bits, far beyond guessing over the network. */
export const makeSetupCode = Effect.sync(() =>
  Array.from({ length: GROUPS }, () =>
    Array.from({ length: GROUP_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")
  ).join("-")
)

/** Case, dashes and spaces do not matter, so a code typed by hand still matches. */
const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "")

const digest = (code: string) => createHash("sha256").update(normalize(code)).digest()

/** Compares in constant time, so the answer time says nothing about how close a guess was. */
export const sameSetupCode = (given: string, expected: string) => timingSafeEqual(digest(given), digest(expected))

/** Who may create a business on this server (ADR 0028). */
export class Signup extends Context.Service<
  Signup,
  {
    /** Anyone may create a business. Off by default. */
    readonly open: boolean
    /** Makes the code a new server is set up with. */
    readonly newSetupCode: Effect.Effect<string>
  }
>()("@scope-bot/server/Signup") {
  /** Reads `SIGNUP`, `closed` unless it says `open`. */
  static readonly layerConfig = Layer.effect(
    Signup,
    Config.Literals(["open", "closed"], "SIGNUP").pipe(
      Config.withDefault("closed" as const),
      Effect.map((mode) => Signup.of({ open: mode === "open", newSetupCode: makeSetupCode }))
    )
  )

  static readonly layer = (options: { readonly open: boolean; readonly setupCode?: string }) =>
    Layer.succeed(
      Signup,
      Signup.of({
        open: options.open,
        newSetupCode: options.setupCode === undefined ? makeSetupCode : Effect.succeed(options.setupCode)
      })
    )
}
