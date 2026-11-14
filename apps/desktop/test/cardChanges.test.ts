import { assert, describe, it } from "@effect/vitest"
import type { Appointment } from "@scope-bot/domain"
import { cardChanges, changesText } from "../renderer/src/cardChanges.ts"

const appointment = (id: string) => ({ id }) as Appointment

describe("cardChanges", () => {
  it("finds what came and went since the answer", () => {
    const changes = cardChanges([appointment("levan"), appointment("beka")], ["levan", "lela"])
    assert.deepStrictEqual([...changes.added], ["beka"])
    assert.deepStrictEqual(changes.gone, ["lela"])
    assert.strictEqual(changesText(changes), "2 changes since the answer")
  })

  it("says nothing when the day is as the answer saw it, or the card is from before", () => {
    assert.isNull(changesText(cardChanges([appointment("levan")], ["levan"])))
    assert.isNull(changesText(cardChanges([appointment("levan")], undefined)))
  })
})
