import { PgClient } from "@effect/sql-pg"
import { Layer, type Redacted, String as Str } from "effect"
import { migrate } from "./Migrations.ts"

const client = (url: Redacted.Redacted) =>
  PgClient.layer({
    url,
    applicationName: "scope-bot",
    transformQueryNames: Str.camelToSnake,
    transformResultNames: Str.snakeToCamel
  })

/** A connection pool on an up-to-date schema. The server does not start without one. */
export const databaseLayer = (url: Redacted.Redacted) =>
  Layer.effectDiscard(migrate).pipe(Layer.provideMerge(client(url)), Layer.orDie)
