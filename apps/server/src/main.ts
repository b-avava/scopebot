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
  Instagram,
  LocalCli,
  ModelProviders,
  Services,
  Telegram,
  WhatsApp
} from "@scope-bot/agents"
import {
  Accounts,
  databaseLayer,
  InstagramStorage,
  ProviderKeys,
  pgStoreLayer,
  TelegramStorage,
  WhatsAppStorage
} from "@scope-bot/db"
import { BaileysClientLayer, InstagramClientLayer, InstagramSetup, TelegramClientLayer } from "@scope-bot/integrations"
import { Config, Effect, Layer, Option } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"
import { Auth } from "./Auth.ts"
import { ApiRoutes } from "./Http.ts"
import { InstagramRoutes } from "./InstagramRoutes.ts"
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

const InstagramStorageLayer = Layer.unwrap(
  Config.Redacted("SCOPE_BOT_SECRET").pipe(Effect.map(InstagramStorage.layerPostgres))
).pipe(Layer.provide(DatabaseLayer))

// A Meta app is optional: without all four values Instagram says it is not set up on this server.
const InstagramSetupLayer = Layer.effect(
  InstagramSetup,
  Effect.gen(function* () {
    const appId = yield* Config.option(Config.String("INSTAGRAM_APP_ID"))
    const appSecret = yield* Config.option(Config.Redacted("INSTAGRAM_APP_SECRET"))
    const verifyToken = yield* Config.option(Config.Redacted("INSTAGRAM_VERIFY_TOKEN"))
    const publicUrl = yield* Config.option(Config.String("PUBLIC_URL"))
    const all = Option.all({ appId, appSecret, verifyToken, publicUrl })
    return InstagramSetup.of({
      app: Option.match(all, {
        onNone: () => null,
        onSome: (app) => ({ ...app, publicUrl: app.publicUrl.replace(/\/+$/, "") })
      })
    })
  })
)

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
  Telegram.layer.pipe(Layer.provide(TelegramStorageLayer), Layer.provide(TelegramClientLayer)),
  Instagram.layer.pipe(
    Layer.provide(InstagramStorageLayer),
    Layer.provide(InstagramClientLayer),
    Layer.provide(InstagramSetupLayer)
  )
).pipe(Layer.provide(AgentServices), Layer.provide(StoreLayer))

const AuthServices = AuthorizationLayer.pipe(
  Layer.provideMerge(Auth.layer),
  Layer.provide(AccountsLayer),
  Layer.provide(AgentServices)
)

const Main = HttpRouter.serve(Layer.mergeAll(ApiRoutes, InstagramRoutes)).pipe(
  Layer.provide(AuthServices),
  Layer.provide(ChannelServices),
  Layer.provide(AgentServices),
  Layer.provide(ServerLayer)
)

Layer.launch(Main).pipe(NodeRuntime.runMain)
