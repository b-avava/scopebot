import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { type Agent, AgentId, defaultSettings } from "@scope-bot/domain"
import { Effect, FileSystem, Option, Path } from "effect"
import { Store } from "../src/Store.ts"

const agent: Agent = {
  ...defaultSettings({ name: "Nino", job: "Front desk", color: "#000000", shape: "squircle", face: "neutral" }),
  id: AgentId.make("nino"),
  pinned: false,
  createdAt: "2026-11-04T00:00:00.000Z"
}

describe("Store", () => {
  it.effect("keeps data in a file across restarts", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fs.makeTempDirectoryScoped()
      const filePath = path.join(directory, "nested", "data.json")

      yield* Store.use((store) => store.saveAgent(agent)).pipe(Effect.provide(Store.layerFile(filePath)))

      const found = yield* Store.use((store) => store.findAgent(agent.id)).pipe(
        Effect.provide(Store.layerFile(filePath))
      )

      assert.deepStrictEqual(Option.getOrNull(found), agent)
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  )

  it.effect("upgrades a file written by an earlier version", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fs.makeTempDirectoryScoped()
      const filePath = path.join(directory, "old.json")
      yield* fs.writeFileString(
        filePath,
        JSON.stringify({
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
          messages: [
            {
              id: "m",
              agentId: "old",
              role: "customer",
              text: "Hello",
              createdAt: "2026-11-04T00:00:00.000Z"
            }
          ],
          actions: []
        })
      )

      const agents = yield* Store.use((store) => store.agents).pipe(Effect.provide(Store.layerFile(filePath)))
      const upgraded = agents[0]

      assert.strictEqual(upgraded?.instructions, "Keep me")
      assert.isFalse(upgraded?.active)
      assert.strictEqual(upgraded?.shape, "circle")
      assert.strictEqual(upgraded?.face, "happy")
      assert.strictEqual(upgraded?.permissions.offerDiscounts, "approve")
      assert.strictEqual(upgraded?.provider, "api")

      const stored = Store.use((store) =>
        Effect.all([store.conversations(AgentId.make("old")), store.messages(AgentId.make("old"))])
      ).pipe(Effect.provide(Store.layerFile(filePath)))
      const [conversations, messages] = yield* stored
      assert.strictEqual(conversations[0]?.title, "Chat")
      assert.strictEqual(messages[0]?.conversationId, conversations[0]?.id)
      assert.isNull(
        (yield* Store.use((store) => store.preferences).pipe(Effect.provide(Store.layerFile(filePath)))).defaultProvider
      )
      assert.deepStrictEqual(upgraded?.backupModels, [{ provider: "api", model: "older-model" }])
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
  )
})
