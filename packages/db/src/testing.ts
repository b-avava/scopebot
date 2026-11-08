import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { databaseLayer } from "./Database.ts"

const serverUrl = () => {
  const url = process.env.TEST_DATABASE_URL
  if (url === undefined || url === "") {
    throw new Error("Set TEST_DATABASE_URL to a PostgreSQL server where the role can create databases")
  }
  return url
}

/** A new empty database with the current schema, dropped when the layer closes. */
export const testDatabaseLayer = Layer.unwrap(
  Effect.gen(function* () {
    const url = new URL(serverUrl())
    const name = `scope_bot_test_${crypto.randomUUID().replaceAll("-", "")}`
    const admin = PgClient.layer({ url: Redacted.make(url.href) })
    const runAsAdmin = (statement: string) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.unsafe(statement)
      }).pipe(Effect.provide(admin), Effect.orDie)

    yield* Effect.acquireRelease(runAsAdmin(`CREATE DATABASE ${name}`), () =>
      runAsAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    )

    url.pathname = `/${name}`
    return databaseLayer(Redacted.make(url.href))
  })
)
