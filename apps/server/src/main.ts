import { createServer } from "node:http"
import { NodeHttpServer, NodeRuntime, NodeServices } from "@effect/platform-node"
import { AgentChat, Agents, ConfiguredChatModel, LocalCli, ModelProviders } from "@scope-bot/agents"
import { ProviderKeys, Store } from "@scope-bot/db"
import { Config, Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { ApiRoutes } from "./Http.ts"

const ServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port("PORT").pipe(Config.withDefault(3000))
    // There is no authentication yet, so the API must not leave this machine.
    const host = yield* Config.String("HOST").pipe(Config.withDefault("127.0.0.1"))
    return NodeHttpServer.layer(createServer, { port, host })
  })
)

const StoreLayer = Layer.unwrap(
  Effect.gen(function* () {
    const filePath = yield* Config.String("SCOPE_BOT_DATA_FILE").pipe(Config.withDefault(".data/scope-bot.json"))
    return Store.layerFile(filePath)
  })
).pipe(Layer.provide(NodeServices.layer))

const KeysLayer = Layer.unwrap(
  Effect.gen(function* () {
    const filePath = yield* Config.String("SCOPE_BOT_KEYS_FILE").pipe(Config.withDefault(".data/provider-keys.json"))
    return ProviderKeys.layerFile(filePath)
  })
).pipe(Layer.provide(NodeServices.layer))

const AgentServices = AgentChat.layer.pipe(
  Layer.provideMerge(Agents.layer),
  Layer.provideMerge(ModelProviders.layer),
  Layer.provide(ConfiguredChatModel),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(KeysLayer),
  Layer.provide(LocalCli.layer.pipe(Layer.provide(NodeServices.layer))),
  Layer.provide(StoreLayer)
)

const Main = HttpRouter.serve(ApiRoutes).pipe(Layer.provide(AgentServices), Layer.provide(ServerLayer))

Layer.launch(Main).pipe(NodeRuntime.runMain)
