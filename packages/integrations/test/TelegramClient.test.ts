import { assert, describe, it } from "@effect/vitest"
import { toUpdate } from "../src/telegram/TelegramClient.ts"

const person = { id: 5001, is_bot: false, first_name: "Anna", last_name: "Kiknadze", username: "anna_k" }
const message = (extra: Record<string, unknown>) => ({
  message_id: 7,
  date: 1_794_000_000,
  chat: { id: 5001, type: "private" },
  from: person,
  ...extra
})

describe("toUpdate", () => {
  it("reads a text sent to the bot", () => {
    assert.deepStrictEqual(toUpdate({ update_id: 10, message: message({ text: "Hi" }) }), {
      _tag: "Message",
      updateId: 10,
      message: {
        id: "bot:5001:7",
        chatId: "5001",
        businessConnectionId: null,
        fromId: "5001",
        name: "Anna Kiknadze",
        username: "anna_k",
        text: "Hi"
      }
    })
  })

  it("reads a message in a business account's chat with its connection", () => {
    const update = toUpdate({ update_id: 11, business_message: message({ text: "Hi", business_connection_id: "biz" }) })
    assert.strictEqual(update?._tag, "Message")
    if (update?._tag === "Message") {
      assert.strictEqual(update.message.businessConnectionId, "biz")
      assert.strictEqual(update.message.id, "biz:5001:7")
    }
  })

  it("describes photos and keeps captions", () => {
    const photo = toUpdate({ update_id: 12, message: message({ photo: [{}], caption: "This one" }) })
    const voice = toUpdate({ update_id: 13, message: message({ voice: {} }) })
    assert.strictEqual(photo?._tag === "Message" ? photo.message.text : null, "This one")
    assert.strictEqual(voice?._tag === "Message" ? voice.message.text : null, "[Voice message]")
  })

  it("leaves out groups, other bots and service messages, but still moves past them", () => {
    const group = toUpdate({ update_id: 14, message: message({ text: "Hi all", chat: { id: -1, type: "group" } }) })
    const bot = toUpdate({ update_id: 15, message: message({ text: "Beep", from: { ...person, is_bot: true } }) })
    const joined = toUpdate({ update_id: 16, message: message({ new_chat_members: [] }) })
    assert.deepStrictEqual(
      [group, bot, joined],
      [
        { _tag: "Other", updateId: 14 },
        { _tag: "Other", updateId: 15 },
        { _tag: "Other", updateId: 16 }
      ]
    )
  })

  it("reads a business connection with the older and the newer rights", () => {
    const user = { id: 777, is_bot: false, first_name: "Northwind", username: "northwind" }
    const older = toUpdate({
      update_id: 17,
      business_connection: { id: "biz", user, user_chat_id: 777, date: 1, can_reply: true, is_enabled: true }
    })
    const newer = toUpdate({
      update_id: 18,
      business_connection: {
        id: "biz",
        user,
        user_chat_id: 777,
        date: 1,
        rights: { can_reply: false },
        is_enabled: true
      }
    })
    assert.deepStrictEqual(older, {
      _tag: "BusinessConnection",
      updateId: 17,
      connection: { id: "biz", userId: "777", name: "Northwind", username: "northwind", enabled: true }
    })
    assert.isFalse(newer?._tag === "BusinessConnection" && newer.connection.enabled)
  })
})
