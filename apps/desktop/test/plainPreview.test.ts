import { assert, describe, it } from "@effect/vitest"
import { plainPreview } from "../renderer/src/plainPreview.ts"

describe("plainPreview", () => {
  it("drops the Markdown of an answer", () => {
    assert.strictEqual(
      plainPreview("### Before the consultation\n\n1. Bring his *X-ray*\n- **Free** at ~~10:00~~ 11:00"),
      "Before the consultation Bring his X-ray Free at 10:00 11:00"
    )
    assert.strictEqual(plainPreview("> a quote with a [link](https://example.com)"), "a quote with a link")
  })

  it("reads a table as its cells", () => {
    assert.strictEqual(
      plainPreview("| Service | Price |\n|---|--:|\n| Filling | 80 GEL |"),
      "Service · Price Filling · 80 GEL"
    )
  })

  it("keeps what only looks like Markdown", () => {
    assert.strictEqual(plainPreview("2 * 3 = 6, and 5*4"), "2 * 3 = 6, and 5*4")
    assert.strictEqual(plainPreview("Hello!\nAre you open?"), "Hello! Are you open?")
  })
})
