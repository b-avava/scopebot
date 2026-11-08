import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { Effect } from "effect"

// The parameters OWASP recommends for scrypt. They travel with each hash, so they can be raised later.
const COST = 2 ** 17
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const KEY_BYTES = 32
const SALT_BYTES = 16
const MAX_MEMORY = 256 * 1024 * 1024

const derive = (password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number) =>
  Effect.callback<Buffer>((resume) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_BYTES,
      { N: cost, r: blockSize, p: parallelization, maxmem: MAX_MEMORY },
      (error, key) => resume(error === null ? Effect.succeed(key) : Effect.die(error))
    )
  })

export const hashPassword = (password: string) =>
  Effect.gen(function* () {
    const salt = randomBytes(SALT_BYTES)
    const key = yield* derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION)
    return ["scrypt", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64"), key.toString("base64")].join("$")
  })

export const verifyPassword = (password: string, stored: string) =>
  Effect.gen(function* () {
    const [, cost, blockSize, parallelization, salt = "", key = ""] = stored.split("$")
    const expected = Buffer.from(key, "base64")
    const actual = yield* derive(
      password,
      Buffer.from(salt, "base64"),
      Number(cost),
      Number(blockSize),
      Number(parallelization)
    )
    return timingSafeEqual(actual, expected)
  })
