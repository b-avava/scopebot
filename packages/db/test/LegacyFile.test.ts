import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { type Agent, AgentId, defaultSettings } from "@scope-bot/domain"
import { Effect, FileSystem, Path } from "effect"
import { readLegacyFile } from "../src/LegacyFile.ts"

const agent: Agent = {
  ...defaultSettings({ name: "Nino", job: "Front desk", color: "#000000" }),
  id: AgentId.make("nino"),
  role: null,
  pinned: false,
  createdAt: "2026-11-04T00:00:00.000Z"
}

const read = (contents: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* fs.makeTempDirectoryScoped()
    const filePath = path.join(directory, "old.json")
    yield* fs.writeFileString(filePath, JSON.stringify(contents))
    return yield* readLegacyFile(filePath)
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))

describe("readLegacyFile", () => {
  it.effect("reads a file from before contacts existed", () =>
    Effect.gen(function* () {
      const data = yield* read({ agents: [] })

      assert.deepStrictEqual(data.contacts, [])
    })
  )

  it.effect("gives agents from an earlier version no department", () =>
    Effect.gen(function* () {
      const { departmentId: _departmentId, ...older } = agent
      const data = yield* read({ agents: [older] })

      assert.isNull(data.agents[0]?.departmentId)
    })
  )

  it.effect("upgrades a file written by an earlier version", () =>
    Effect.gen(function* () {
      const data = yield* read({
        agents: [
          {
            id: "old",
            name: "Tamar",
            job: "Sales",
            color: "#000000",
            shape: "tooth",
            face: "happy",
            instructions: "Keep me",
            model: "",
            backupModels: ["older-model"],
            active: false,
            createdAt: "2026-11-04T00:00:00.000Z"
          }
        ],
        messages: [{ id: "m", agentId: "old", role: "customer", text: "Hello", createdAt: "2026-11-04T00:00:00.000Z" }],
        actions: []
      })
      const upgraded = data.agents[0]

      assert.strictEqual(upgraded?.instructions, "Keep me")
      assert.isFalse(upgraded?.active)
      assert.notProperty(upgraded, "shape")
      assert.notProperty(upgraded, "face")
      assert.strictEqual(upgraded?.sign, "tag")
      assert.isNull(upgraded?.role)
      assert.strictEqual(upgraded?.permissions.offerDiscounts, "approve")
      assert.strictEqual(upgraded?.provider, "api")
      assert.strictEqual(data.conversations[0]?.title, "Chat")
      assert.strictEqual(data.messages[0]?.conversationId, data.conversations[0]?.id)
      assert.isNull(data.preferences.defaultProvider)
      assert.deepStrictEqual(upgraded?.backupModels, [{ provider: "api", model: "older-model" }])
    })
  )

  it.effect("gives the stages of an older funnel their usual chances", () =>
    Effect.gen(function* () {
      const stage = (name: string, kind: string) => ({ id: name, name, kind })
      const data = yield* read({
        pipelines: [
          {
            id: "sales",
            name: "Sales",
            stages: [stage("New", "open"), stage("Proposal", "open"), stage("Calls", "open"), stage("Won", "won")],
            createdAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      })

      assert.deepStrictEqual(
        data.pipelines[0]?.stages.map((item) => item.probability),
        [10, 50, 30, 100]
      )
    })
  )
})
