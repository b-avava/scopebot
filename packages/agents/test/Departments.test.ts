import { assert, describe, it } from "@effect/vitest"
import { Store } from "@scope-bot/db"
import { DepartmentId, DepartmentNotFound } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { Agents } from "../src/Agents.ts"
import { Departments } from "../src/Departments.ts"

const services = Layer.mergeAll(Departments.layer, Agents.layer).pipe(Layer.provide(Store.layerMemory))

const newAgent = { name: "Nino", job: "Sales", color: "#000" } as const

describe("Departments", () => {
  it.effect("creates and renames a department", () =>
    Effect.gen(function* () {
      const departments = yield* Departments

      const created = yield* departments.create({ name: "Sales" })
      const renamed = yield* departments.update(created.id, { name: "Growth" })

      assert.strictEqual(renamed.id, created.id)
      assert.strictEqual(renamed.createdAt, created.createdAt)
      assert.deepStrictEqual(yield* departments.list, [renamed])
    }).pipe(Effect.provide(services))
  )

  it.effect("puts an employee into a department", () =>
    Effect.gen(function* () {
      const departments = yield* Departments
      const agents = yield* Agents
      const department = yield* departments.create({ name: "Sales" })
      const agent = yield* agents.create(newAgent)
      assert.isNull(agent.departmentId)

      const moved = yield* agents.update(agent.id, { ...agent, departmentId: department.id })

      assert.strictEqual(moved.departmentId, department.id)
    }).pipe(Effect.provide(services))
  )

  it.effect("does not put an employee into a department that does not exist", () =>
    Effect.gen(function* () {
      const agents = yield* Agents
      const agent = yield* agents.create(newAgent)

      const failure = yield* agents
        .update(agent.id, { ...agent, departmentId: DepartmentId.make("missing") })
        .pipe(Effect.flip)

      assert.instanceOf(failure, DepartmentNotFound)
      assert.isNull((yield* agents.get(agent.id)).departmentId)
    }).pipe(Effect.provide(services))
  )

  it.effect("keeps the employees of a removed department", () =>
    Effect.gen(function* () {
      const departments = yield* Departments
      const agents = yield* Agents
      const department = yield* departments.create({ name: "Sales" })
      const agent = yield* agents.create(newAgent)
      yield* agents.update(agent.id, { ...agent, departmentId: department.id })

      yield* departments.remove(department.id)

      assert.deepStrictEqual(yield* departments.list, [])
      assert.isNull((yield* agents.get(agent.id)).departmentId)
    }).pipe(Effect.provide(services))
  )

  it.effect("fails for a department that does not exist", () =>
    Effect.gen(function* () {
      const departments = yield* Departments
      const missing = DepartmentId.make("missing")

      assert.instanceOf(yield* departments.update(missing, { name: "x" }).pipe(Effect.flip), DepartmentNotFound)
      assert.instanceOf(yield* departments.remove(missing).pipe(Effect.flip), DepartmentNotFound)
    }).pipe(Effect.provide(services))
  )
})
