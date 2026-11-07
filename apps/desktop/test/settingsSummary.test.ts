import { assert, describe, it } from "@effect/vitest"
import { defaultSettings } from "@scope-bot/domain"
import {
  backupsSummary,
  escalationSummary,
  hoursSummary,
  limitsSummary,
  permissionsSummary,
  widensPolicy
} from "../renderer/src/settingsSummary.ts"

const settings = defaultSettings({ name: "Nino", job: "Sales", color: "#000", shape: "circle", face: "neutral" })

describe("settings summaries", () => {
  it("counts what the employee may do", () => {
    assert.strictEqual(permissionsSummary(settings.permissions), "Alone: 1 · Asks: 4 · Never: 1")
  })

  it("describes limits", () => {
    assert.strictEqual(limitsSummary(settings), "30 replies · up to 10%")
    assert.strictEqual(
      limitsSummary({ limits: { maxMessagesPerDay: 1, maxDiscountPercent: 0 } }),
      "1 reply · no discounts"
    )
  })

  it("reads working days as a range when it can", () => {
    const hours = { ...settings.hours, enabled: true }
    assert.strictEqual(hoursSummary({ hours }), "Mon–Sat, 09:00–18:00")
    assert.strictEqual(hoursSummary({ hours: { ...hours, days: [5, 1, 3] } }), "Mon, Wed, Fri, 09:00–18:00")
    assert.strictEqual(hoursSummary({ hours: { ...hours, days: [] } }), "No days, 09:00–18:00")
    assert.strictEqual(hoursSummary(settings), "Around the clock")
  })

  it("counts handoff cases and backups", () => {
    assert.strictEqual(escalationSummary(settings), "3 cases")
    assert.strictEqual(
      escalationSummary({ escalation: { onComplaint: false, onHumanRequest: false, onUnknownAnswer: false } }),
      "Never"
    )
    assert.strictEqual(backupsSummary(settings), "None")
    assert.strictEqual(backupsSummary({ backupModels: [{ provider: "api", model: "a" }] }), "1 model")
  })

  it("only treats more freedom as a wider policy", () => {
    assert.isTrue(widensPolicy("deny", "approve"))
    assert.isTrue(widensPolicy("approve", "auto"))
    assert.isFalse(widensPolicy("auto", "approve"))
    assert.isFalse(widensPolicy("approve", "approve"))
  })
})
