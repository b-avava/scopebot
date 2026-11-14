import { assert, describe, it } from "@effect/vitest"
import * as Baileys from "@whiskeysockets/baileys"
import { toIncoming } from "../src/whatsapp/BaileysClient.ts"
import { qrRows } from "../src/whatsapp/qr.ts"

const message = (
  key: Partial<Baileys.WAMessageKey>,
  content: Baileys.proto.IMessage,
  extra: Partial<Baileys.WAMessage> = {}
): Baileys.WAMessage => ({
  key: { remoteJid: "995577204518@s.whatsapp.net", fromMe: false, id: "m1", ...key },
  message: content,
  pushName: "Anna",
  messageTimestamp: 1_794_000_000,
  ...extra
})

describe("toIncoming", () => {
  it("reads a text from a person", () => {
    const incoming = toIncoming(Baileys, message({}, { conversation: "Hi!" }))
    assert.deepStrictEqual(incoming, {
      id: "m1",
      chat: "995577204518@s.whatsapp.net",
      phone: "995577204518",
      name: "Anna",
      text: "Hi!",
      sentAt: new Date(1_794_000_000_000).toISOString()
    })
  })

  it("answers a hidden number on its phone number when WhatsApp gives one", () => {
    const withNumber = toIncoming(
      Baileys,
      message({ remoteJid: "123456789@lid", remoteJidAlt: "995577204518@s.whatsapp.net" }, { conversation: "Hi" })
    )
    assert.strictEqual(withNumber?.chat, "995577204518@s.whatsapp.net")
    assert.strictEqual(withNumber?.phone, "995577204518")

    const hidden = toIncoming(Baileys, message({ remoteJid: "123456789@lid" }, { conversation: "Hi" }))
    assert.strictEqual(hidden?.chat, "123456789@lid")
    assert.isNull(hidden?.phone)
  })

  it("describes photos and files, and keeps a caption", () => {
    assert.strictEqual(toIncoming(Baileys, message({}, { imageMessage: { caption: "This one" } }))?.text, "This one")
    assert.strictEqual(toIncoming(Baileys, message({}, { audioMessage: {} }))?.text, "[Voice message]")
    assert.strictEqual(
      toIncoming(Baileys, message({}, { extendedTextMessage: { text: "A link https://example.com" } }))?.text,
      "A link https://example.com"
    )
  })

  it("leaves out groups, statuses, its own messages and reactions", () => {
    assert.isNull(toIncoming(Baileys, message({ remoteJid: "120363@g.us" }, { conversation: "Hi all" })))
    assert.isNull(toIncoming(Baileys, message({ remoteJid: "status@broadcast" }, { conversation: "Story" })))
    assert.isNull(toIncoming(Baileys, message({ fromMe: true }, { conversation: "Sent from the phone" })))
    assert.isNull(toIncoming(Baileys, message({}, { reactionMessage: { text: "👍" } })))
  })
})

describe("qrRows", () => {
  it("draws a square of modules", () => {
    const rows = qrRows("2@abc,def,ghi")
    assert.isTrue(rows.length >= 21)
    assert.isTrue(rows.every((row) => row.length === rows.length && /^[01]+$/.test(row)))
  })
})
