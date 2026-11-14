import { Store } from "@scope-bot/db"
import { type Department, type DepartmentDetails, DepartmentId, DepartmentNotFound } from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { nowIso } from "./Agents.ts"

/** Groups of employees. */
export class Departments extends Context.Service<
  Departments,
  {
    readonly list: Effect.Effect<ReadonlyArray<Department>>
    create(details: DepartmentDetails): Effect.Effect<Department>
    update(id: DepartmentId, details: DepartmentDetails): Effect.Effect<Department, DepartmentNotFound>
    /** Its employees stay and no longer belong to a department. */
    remove(id: DepartmentId): Effect.Effect<void, DepartmentNotFound>
  }
>()("@scope-bot/agents/Departments") {
  static readonly layer = Layer.effect(
    Departments,
    Effect.gen(function* () {
      const store = yield* Store

      const get = (id: DepartmentId) =>
        store.findDepartment(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new DepartmentNotFound()),
              onSome: Effect.succeed
            })
          )
        )

      return Departments.of({
        list: store.departments,
        create: Effect.fn("Departments.create")(function* (details) {
          const department: Department = {
            ...details,
            id: DepartmentId.make(crypto.randomUUID()),
            createdAt: yield* nowIso
          }
          yield* store.saveDepartment(department)
          return department
        }),
        update: Effect.fn("Departments.update")(function* (id, details) {
          const updated: Department = { ...(yield* get(id)), ...details }
          yield* store.saveDepartment(updated)
          return updated
        }),
        remove: Effect.fn("Departments.remove")(function* (id) {
          yield* get(id)
          yield* store.removeDepartment(id)
        })
      })
    })
  )
}
