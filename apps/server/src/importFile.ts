import { existsSync, readFileSync } from "node:fs"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  Accounts,
  CurrentBusiness,
  databaseLayer,
  ProviderKeys,
  pgStoreLayer,
  readLegacyFile,
  Store
} from "@scope-bot/db"
import type { ProviderId } from "@scope-bot/domain"
import { Config, Console, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"

const DATA_FILE = ".data/scope-bot.json"
const KEYS_FILE = ".data/provider-keys.json"

const fail = (message: string) => Effect.die(new Error(message))

/**
 * Moves the old JSON files into the business of an account. The files stay as
 * they are. It runs in one transaction and only into an empty business, so it
 * either happens completely or not at all.
 */
const program = Effect.gen(function* () {
  const email = process.argv[2]?.trim().toLowerCase()
  if (email === undefined || email === "") return yield* fail("Usage: pnpm db:import <email of your account>")
  if (!existsSync(DATA_FILE)) return yield* fail(`There is no ${DATA_FILE} to import`)

  const accounts = yield* Accounts
  const store = yield* Store
  const keys = yield* ProviderKeys
  const sql = yield* SqlClient.SqlClient

  const login = yield* accounts.findLogin(email)
  if (Option.isNone(login)) return yield* fail(`No account uses ${email}. Sign up in the app first.`)
  const business = login.value.account.businessId
  const data = yield* readLegacyFile(DATA_FILE)

  const run = Effect.gen(function* () {
    const inUse = [yield* store.agents, yield* store.contacts, yield* store.deals].some((items) => items.length > 0)
    if (inUse) return yield* fail("This business already has data, so nothing was imported")

    const current = yield* store.business
    yield* store.saveBusiness({ ...data.business, name: data.business.name || current.name })
    yield* store.savePreferences(data.preferences)
    yield* Effect.forEach(data.departments, store.saveDepartment)
    yield* Effect.forEach(data.agents, store.saveAgent)
    // Companies come from the same list, so links are added once everyone exists.
    yield* Effect.forEach(data.contacts, (contact) => store.saveContact({ ...contact, companyId: null }))
    yield* Effect.forEach(data.contacts, store.saveContact)
    // The funnel made at sign up is replaced by the one the deals point at.
    if (data.pipelines.length > 0) yield* sql`DELETE FROM pipelines WHERE business_id = ${business}`
    yield* Effect.forEach(data.pipelines, store.savePipeline)
    yield* Effect.forEach(data.services, store.saveService)
    yield* Effect.forEach(data.deals, store.saveDeal)
    yield* Effect.forEach(data.activities, store.saveActivity)
    yield* Effect.forEach(data.approvals, store.saveApproval)
    yield* Effect.forEach(data.conversations, store.saveConversation)
    yield* Effect.forEach(data.messages, store.appendMessage)
    yield* Effect.forEach(data.actions, store.appendAction)
    yield* Effect.forEach(data.escalations, store.appendEscalation)

    if (existsSync(KEYS_FILE)) {
      const stored: Record<string, { readonly key: string; readonly baseUrl: string }> = JSON.parse(
        readFileSync(KEYS_FILE, "utf8")
      )
      yield* Effect.forEach(Object.entries(stored), ([provider, input]) => keys.save(provider as ProviderId, input))
    }
  })

  yield* sql.withTransaction(run).pipe(Effect.provideService(CurrentBusiness, business))
  yield* Console.log(
    `Imported ${data.agents.length} employees, ${data.contacts.length} contacts, ${data.deals.length} deals, ` +
      `${data.services.length} services and ${data.messages.length} messages into ${email}`
  )
})

const Database = Layer.unwrap(Config.Redacted("DATABASE_URL").pipe(Effect.map(databaseLayer)))

const Keys = Layer.unwrap(Config.Redacted("SCOPE_BOT_SECRET").pipe(Effect.map(ProviderKeys.layerPostgres)))

const Services = Layer.mergeAll(pgStoreLayer, Accounts.layer, Keys).pipe(Layer.provideMerge(Database))

program.pipe(Effect.provide(Services), Effect.provide(NodeServices.layer), NodeRuntime.runMain)
