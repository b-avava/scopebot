import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import {
  Activities,
  AgentChat,
  Agents,
  Approvals,
  ConfiguredChatModel,
  Contacts,
  Deals,
  Departments,
  LocalCli,
  ModelProviders,
  Services,
  Telegram,
  WhatsApp
} from "@scope-bot/agents"
import { Accounts, databaseLayer, ProviderKeys, pgStoreLayer, TelegramStorage, WhatsAppStorage } from "@scope-bot/db"
import { BaileysClientLayer, TelegramClientLayer } from "@scope-bot/integrations"
import { Config, Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"
import { Auth } from "./Auth.ts"
import { ApiRoutes } from "./Http.ts"
import { AuthorizationLayer } from "./Security.ts"

const DatabaseLayer = Layer.unwrap(Config.Redacted("DATABASE_URL").pipe(Effect.map(databaseLayer)))

// Opens the port once migrations are done, so no request arrives before the API can answer it.
const ServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    yield* SqlClient.SqlClient
    const port = yield* Config.Port("PORT").pipe(Config.withDefault(3000))
    // Sessions travel in plain HTTP here, so a public server needs TLS in front of it.
    const host = yield* Config.String("HOST").pipe(Config.withDefault("127.0.0.1"))
    return NodeHttpServer.layer(createServer, { port, host })
  })
).pipe(Layer.provide(DatabaseLayer))

const StoreLayer = pgStoreLayer.pipe(Layer.provide(DatabaseLayer))

const AccountsLayer = Accounts.layer.pipe(Layer.provide(DatabaseLayer))

const KeysLayer = Layer.unwrap(Config.Redacted("SCOPE_BOT_SECRET").pipe(Effect.map(ProviderKeys.layerPostgres))).pipe(
  Layer.provide(DatabaseLayer)
)

const WhatsAppStorageLayer = Layer.unwrap(
  Config.Redacted("SCOPE_BOT_SECRET").pipe(Effect.map(WhatsAppStorage.layerPostgres))
).pipe(Layer.provide(DatabaseLayer))

const TelegramStorageLayer = Layer.unwrap(
  Config.Redacted("SCOPE_BOT_SECRET").pipe(Effect.map(TelegramStorage.layerPostgres))
).pipe(Layer.provide(DatabaseLayer))

const AgentServices = AgentChat.layer.pipe(
  Layer.provideMerge(Agents.layer),
  Layer.provideMerge(Contacts.layer),
  Layer.provideMerge(Departments.layer),
  Layer.provideMerge(Deals.layer),
  Layer.provideMerge(Services.layer),
  Layer.provideMerge(Activities.layer),
  Layer.provideMerge(Approvals.layer),
  Layer.provideMerge(ModelProviders.layer),
  Layer.provide(ConfiguredChatModel),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(KeysLayer),
  Layer.provide(LocalCli.layer.pipe(Layer.provide(NodeServices.layer))),
  Layer.provide(StoreLayer)
)

// Linked numbers reconnect and bots start listening as soon as these layers are built.
const ChannelServices = Layer.mergeAll(
  WhatsApp.layer.pipe(Layer.provide(WhatsAppStorageLayer), Layer.provide(BaileysClientLayer)),
  Telegram.layer.pipe(Layer.provide(TelegramStorageLayer), Layer.provide(TelegramClientLayer))
).pipe(Layer.provide(AgentServices), Layer.provide(StoreLayer))

const AuthServices = AuthorizationLayer.pipe(
  Layer.provideMerge(Auth.layer),
  Layer.provide(AccountsLayer),
  Layer.provide(AgentServices)
)

const Main = HttpRouter.serve(ApiRoutes).pipe(
  Layer.provide(AuthServices),
  Layer.provide(ChannelServices),
  Layer.provide(AgentServices),
  Layer.provide(ServerLayer)
)

Layer.launch(Main).pipe(NodeRuntime.runMain)
