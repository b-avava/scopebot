import { assert, describe, it } from "@effect/vitest"
import { authorizeUrl, parseWebhook, signatureMatches } from "../src/instagram/InstagramClient.ts"
import { makeFakeInstagram, testInstagramApp } from "../src/testing.ts"

const body = (messaging: ReadonlyArray<unknown>, object = "instagram") =>
  JSON.stringify({ object, entry: [{ id: "acct", time: 1, messaging }] })

const from = (sender: string, message: Record<string, unknown>) => ({
  sender: { id: sender },
  recipient: { id: "acct" },
  timestamp: 1,
  message
})

describe("Instagram webhooks", () => {
  it("accepts only bodies signed with the app secret", () => {
    const { body: signed, signature } = makeFakeInstagram().webhook("anna", "Hi")
    assert.isTrue(signatureMatches(testInstagramApp, signed, signature))
    assert.isFalse(signatureMatches(testInstagramApp, `${signed} `, signature))
    assert.isFalse(signatureMatches(testInstagramApp, signed, "sha256=abcd"))
    assert.isFalse(signatureMatches(testInstagramApp, signed, undefined))
  })

  it("reads messages from people, and leaves out echoes, the account itself and other objects", () => {
    const messages = parseWebhook(
      body([
        from("anna", { mid: "m1", text: "Hi" }),
        from("anna", { mid: "m2", text: "Mine", is_echo: true }),
        from("acct", { mid: "m3", text: "Me again" }),
        from("anna", { mid: "m4", attachments: [{ type: "image" }] }),
        from("anna", { mid: "m5", reply_to: { story: { id: "s", url: "u" } } }),
        { sender: { id: "anna" }, recipient: { id: "acct" }, timestamp: 1, read: { mid: "m1" } }
      ])
    )
    assert.deepStrictEqual(
      messages.map((message) => [message.messageId, message.text, message.storyReply]),
      [
        ["m1", "Hi", false],
        ["m4", "[Photo]", false],
        ["m5", "[Replied to your story]", true]
      ]
    )
    assert.lengthOf(parseWebhook(body([from("anna", { mid: "m1", text: "Hi" })], "page")), 0)
    assert.lengthOf(parseWebhook("not json"), 0)
  })

  it("asks for reading and sending messages, and comes back to this server", () => {
    const url = new URL(authorizeUrl(testInstagramApp, "state-1"))
    assert.strictEqual(url.searchParams.get("scope"), "instagram_business_basic,instagram_business_manage_messages")
    assert.strictEqual(url.searchParams.get("redirect_uri"), "https://crm.example.com/instagram/oauth/callback")
    assert.strictEqual(url.searchParams.get("state"), "state-1")
  })
})
