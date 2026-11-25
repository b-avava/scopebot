import { assert, describe, it } from "@effect/vitest"
import { environmentOf } from "../src/LocalCli.ts"

describe("LocalCli environment", () => {
  it("sets PWD to the working directory and keeps added values", () => {
    assert.deepStrictEqual(environmentOf({ cwd: "/empty", env: { ANTHROPIC_API_KEY: "key" } }), {
      PWD: "/empty",
      ANTHROPIC_API_KEY: "key"
    })
  })

  it("adds no PWD without a working directory", () => {
    assert.deepStrictEqual(environmentOf({ env: { CODEX_API_KEY: "key" } }), { CODEX_API_KEY: "key" })
  })

  it("lets an explicit value win", () => {
    assert.deepStrictEqual(environmentOf({ cwd: "/empty", env: { PWD: "/elsewhere" } }), { PWD: "/elsewhere" })
  })
})
