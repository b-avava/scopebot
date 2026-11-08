import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { Redacted } from "effect"

const IV_BYTES = 12

/** AES-256-GCM. The tag also proves the stored value was not changed. */
export const encrypt = (secret: Buffer, text: string) => {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", secret, iv)
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".")
}

export const decrypt = (secret: Buffer, stored: string) => {
  const [iv = "", tag = "", encrypted = ""] = stored.split(".")
  const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8")
}

/** `SCOPE_BOT_SECRET` holds 32 random bytes in base64. */
export const parseSecret = (secret: Redacted.Redacted<string>) => {
  const bytes = Buffer.from(Redacted.value(secret), "base64")
  if (bytes.length !== 32) throw new Error("SCOPE_BOT_SECRET must be 32 bytes in base64")
  return bytes
}
