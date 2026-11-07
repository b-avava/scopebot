import { assert, describe, it } from "@effect/vitest"
import { messageTime } from "../renderer/src/messageTime.ts"

const now = new Date(2026, 10, 7, 12, 0)
const at = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString()

describe("messageTime", () => {
  it("shows the hour for today", () => {
    assert.strictEqual(messageTime(at(2026, 10, 7, 9, 5), now), "09:05")
  })

  it("names recent days", () => {
    assert.strictEqual(messageTime(at(2026, 10, 6, 23, 59), now), "Yesterday")
    assert.strictEqual(messageTime(at(2026, 10, 3, 10, 0), now), "Tue")
  })

  it("falls back to a date, with the year only when it differs", () => {
    assert.strictEqual(messageTime(at(2026, 9, 1, 10, 0), now), "01.10")
    assert.strictEqual(messageTime(at(2025, 11, 31, 10, 0), now), "31.12.25")
  })
})
