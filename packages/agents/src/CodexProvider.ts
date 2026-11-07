import type { ProviderKeys } from "@scope-bot/db"
import {
  ModelFailed,
  ModelNotConfigured,
  type ModelOption,
  type ProviderCatalog,
  ProviderLoginFailed,
  ReasoningEffort
} from "@scope-bot/domain"
import { Effect, Option, Redacted, Schema } from "effect"
import type { ChatRequest } from "./ChatModel.ts"
import { type CliFolder, conversationImages, conversationPrompt, isModelId, type LocalCli } from "./LocalCli.ts"
import type { ChatProvider } from "./ModelProviders.ts"

const REPLY_TIMEOUT = "120 seconds"
const LOOKUP_TIMEOUT = "20 seconds"
const LOGIN_TIMEOUT = "5 minutes"

// Codex has no switch for "no tools", so each one is turned off by name. A new
// Codex version can add tools, so check this list when updating it.
const DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "multi_agent",
  "apps",
  "plugins",
  "hooks",
  "view_image",
  "image_generation",
  "browser_use",
  "computer_use",
  "goals",
  "skill_search",
  "tool_suggest",
  "sleep_tool"
]

const Catalog = Schema.fromJsonString(
  Schema.Struct({
    models: Schema.Array(
      Schema.Struct({
        slug: Schema.String,
        display_name: Schema.String,
        visibility: Schema.String,
        supported_reasoning_levels: Schema.Array(Schema.Struct({ effort: Schema.String }))
      })
    )
  })
)

const Event = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.String,
    message: Schema.optionalKey(Schema.String),
    error: Schema.optionalKey(Schema.Struct({ message: Schema.String })),
    item: Schema.optionalKey(Schema.Struct({ type: Schema.String, text: Schema.optionalKey(Schema.String) })),
    usage: Schema.optionalKey(Schema.Struct({ input_tokens: Schema.Number, output_tokens: Schema.Number }))
  })
)

const isEffort = Schema.is(ReasoningEffort)

const toOption = (model: (typeof Catalog.Type)["models"][number]): ModelOption => ({
  id: model.slug,
  name: model.display_name,
  group: "",
  free: false,
  efforts: model.supported_reasoning_levels.map((level) => level.effort).filter(isEffort)
})

const parseModels = (stdout: string) => {
  const decoded = Schema.decodeUnknownOption(Catalog)(stdout.trim())
  const models = Option.isNone(decoded)
    ? []
    : decoded.value.models.filter((model) => model.visibility === "list").map(toOption)
  return { defaultModel: models[0]?.id ?? "", models }
}

const base = { id: "codex", name: "ChatGPT", account: "", defaultModel: "", models: [] } as const

const toReply = (stdout: string, exitCode: number, model: string) => {
  const events = stdout
    .split("\n")
    .map((line) => Schema.decodeUnknownOption(Event)(line.trim()))
    .flatMap((event) => (Option.isSome(event) ? [event.value] : []))

  const failure = events.find((event) => event.type === "turn.failed" || event.type === "error")
  const failureText = failure?.error?.message ?? failure?.message ?? ""
  if (/log ?in|401|unauthorized/i.test(failureText)) return Effect.fail(new ModelNotConfigured())
  if (failure !== undefined) return Effect.fail(new ModelFailed({ reason: "cli_error" }))
  if (exitCode !== 0) return Effect.fail(new ModelFailed({ reason: `cli_exit_${exitCode}` }))

  const messages = events.flatMap((event) => (event.item?.type === "agent_message" ? [event.item.text ?? ""] : []))
  const text = messages.at(-1) ?? ""
  if (text === "") return Effect.fail(new ModelFailed({ reason: "empty_reply" }))

  const usage = events.find((event) => event.type === "turn.completed")?.usage
  return Effect.succeed({
    text,
    model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0
  })
}

const replyArgs = (request: ChatRequest, folder: CliFolder) => [
  "exec",
  "--ignore-user-config",
  "--ignore-rules",
  "--ephemeral",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--json",
  "-C",
  folder.path,
  "-c",
  `model_instructions_file=${JSON.stringify(folder.systemFile.replaceAll("\\", "/"))}`,
  // Short conversational replies do not need deep reasoning unless the business asks for it.
  "-c",
  `model_reasoning_effort=${request.reasoning === "default" ? "low" : request.reasoning}`,
  ...DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
  ...(request.model === "" ? [] : ["-m", request.model]),
  ...folder.imageFiles.map((file) => `--image=${file}`),
  "-"
]

/** Codex, through the ChatGPT account signed in on this machine or an API key. */
export const makeCodexProvider = (
  cli: LocalCli["Service"],
  keys: Pick<ProviderKeys["Service"], "get">
): ChatProvider => {
  const keyEnv = keys
    .get("codex")
    .pipe(
      Effect.map(
        (stored): Record<string, string> =>
          Option.isSome(stored) ? { CODEX_API_KEY: Redacted.value(stored.value.key) } : {}
      )
    )

  return {
    catalog: Effect.gen(function* () {
      const env = yield* keyEnv
      const hasKey = Object.keys(env).length > 0

      const version = yield* cli.run({ name: "codex", args: ["--version"], timeout: LOOKUP_TIMEOUT })
      const detail = version.stdout.trim()

      const login = yield* cli.run({ name: "codex", args: ["login", "status"], timeout: LOOKUP_TIMEOUT })
      const signedIn = /logged in/i.test(`${login.stdout}\n${login.stderr}`) && login.exitCode === 0
      if (!signedIn && !hasKey) {
        return {
          ...base,
          detail,
          hasKey,
          status: "signed-out",
          hint: "Sign in, or add an API key."
        } satisfies ProviderCatalog
      }

      const models = yield* cli.run({ name: "codex", args: ["debug", "models"], env, timeout: LOOKUP_TIMEOUT })
      return {
        ...base,
        detail: signedIn ? `${detail} · ChatGPT plan` : detail,
        hasKey,
        status: "connected",
        hint: "",
        ...parseModels(models.stdout)
      } satisfies ProviderCatalog
    }).pipe(
      Effect.catchTag("CliUnavailable", () =>
        keyEnv.pipe(
          Effect.map(
            (env) =>
              ({
                ...base,
                detail: "",
                hasKey: Object.keys(env).length > 0,
                status: "not-installed",
                hint: "Install it with npm install -g @openai/codex."
              }) satisfies ProviderCatalog
          )
        )
      )
    ),

    login: Effect.suspend(() => cli.run({ name: "codex", args: ["login"], timeout: LOGIN_TIMEOUT })).pipe(
      Effect.mapError(() => new ProviderLoginFailed()),
      Effect.flatMap(({ exitCode }) => (exitCode === 0 ? Effect.void : Effect.fail(new ProviderLoginFailed())))
    ),

    reply: Effect.fn("Codex.reply")(function* (request) {
      if (request.model !== "" && !isModelId(request.model)) return yield* new ModelFailed({ reason: "invalid_model" })

      const env = yield* keyEnv
      const run = cli.inEmptyFolder(request.system, conversationImages(request.turns), (folder) =>
        cli.run({
          name: "codex",
          args: replyArgs(request, folder),
          input: conversationPrompt(request.turns),
          cwd: folder.path,
          env,
          timeout: REPLY_TIMEOUT
        })
      )
      const { exitCode, stdout } = yield* run.pipe(
        Effect.mapError(() => new ModelFailed({ reason: "cli_unavailable" }))
      )
      return yield* toReply(stdout, exitCode, request.model)
    })
  }
}
