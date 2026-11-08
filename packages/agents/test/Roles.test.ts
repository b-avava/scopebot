import { assert, describe, it } from "@effect/vitest"
import { Store } from "@scope-bot/db"
import { defaultSettings } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { Agents } from "../src/Agents.ts"

const services = Agents.layer.pipe(Layer.provideMerge(Store.layerMemory))

describe("roles", () => {
  it("start from the preset of the role, whatever the job title says", () => {
    const sales = defaultSettings({ name: "Tako", job: "Менеджер по продажам", color: "#000", role: "sales" })

    assert.strictEqual(sales.job, "Менеджер по продажам")
    assert.strictEqual(sales.sign, "tag")
    assert.strictEqual(sales.permissions.offerDiscounts, "approve")
    assert.strictEqual(sales.limits.maxDiscountPercent, 10)
  })

  it("start blank, asking before anything risky, when no role is given", () => {
    const blank = defaultSettings({ name: "Tako", job: "Sales", color: "#000" })

    assert.isNull(blank.sign)
    assert.isTrue(Object.values(blank.permissions).every((policy) => policy === "approve"))
  })

  it.effect("keep the role an employee was hired with, and let the job title change freely", () =>
    Effect.gen(function* () {
      const agents = yield* Agents
      const hired = yield* agents.create({ name: "Tako", job: "Accountant", color: "#000", role: "reports" })

      const renamed = yield* agents.update(hired.id, { ...hired, job: "Chief accountant" })

      assert.strictEqual(hired.role, "reports")
      assert.strictEqual(renamed.role, "reports")
      assert.strictEqual(renamed.sign, "chart")
      assert.strictEqual(renamed.permissions.sendPaymentLinks, "deny")
    }).pipe(Effect.provide(services))
  )
})
