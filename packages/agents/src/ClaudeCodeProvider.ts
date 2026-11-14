import type { ProviderKeys } from "@scope-bot/db"
import {
  ModelFailed,
  ModelNotConfigured,
  type ModelOption,
  ModelRefused,
  type ProviderCatalog,
  ProviderLoginFailed,
  ReasoningEffort
} from "@scope-bot/domain"
import { Effect, Option, Redacted, Schema } from "effect"
import type { ChatRequest } from "./ChatModel.ts"
import { conversationImages, conversationPrompt, isModelId, type LocalCli } from "./LocalCli.ts"
import type { ChatProvider } from "./ModelProviders.ts"

const REPLY_TIMEOUT = "120 seconds"
const LOOKUP_TIMEOUT = "20 seconds"
const LOGIN_TIMEOUT = "5 minutes"

/** Customers talk to this process, so it runs without any tools or user settings. */
const NO_TOOLS = ["--tools", "", "--strict-mcp-config", "--setting-sources", "", "--disable-slash-commands"]

const AuthStatus = Schema.fromJsonString(
  Schema.Struct({
    loggedIn: Schema.Boolean,
    email: Schema.optionalKey(Schema.NullOr(Schema.String)),
    subscriptionType: Schema.optionalKey(Schema.NullOr(Schema.String))
  })
)

const ClaudeModel = Schema.Struct({
  value: Schema.String,
  resolvedModel: Schema.optionalKey(Schema.String),
  displayName: Schema.String,
  supportedEffortLevels: Schema.optionalKey(Schema.Array(Schema.String))
})

const InitializeLine = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.Literal("control_response"),
    response: Schema.Struct({ response: Schema.Struct({ models: Schema.Array(ClaudeModel) }) })
  })
)

const Result = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.Literal("result"),
    is_error: Schema.optionalKey(Schema.Boolean),
    result: Schema.optionalKey(Schema.String),
    stop_reason: Schema.optionalKey(Schema.NullOr(Schema.String)),
    usage: Schema.optionalKey(
      Schema.Struct({
        input_tokens: Schema.Number,
        output_tokens: Schema.Number,
        cache_read_input_tokens: Schema.optionalKey(Schema.Number),
        cache_creation_input_tokens: Schema.optionalKey(Schema.Number)
      })
    ),
    modelUsage: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown))
  })
)

const isEffort = Schema.is(ReasoningEffort)

const toOption = (model: typeof ClaudeModel.Type): ModelOption => ({
  id: model.value,
  name: `Claude ${model.displayName}`,
  group: "",
  free: false,
  efforts: (model.supportedEffortLevels ?? []).filter(isEffort)
})

const parseModels = (stdout: string) => {
  const lines = stdout.split("\n").map((line) => Schema.decodeUnknownOption(InitializeLine)(line))
  const response = lines.find(Option.isSome)
  const models = response === undefined ? [] : Option.getOrThrow(response).response.response.models
  const recommended = models.find((model) => model.value === "default")?.resolvedModel
  const listed = models.filter((model) => model.value !== "default")
  return {
    defaultModel: listed.find((model) => model.resolvedModel === recommended)?.value ?? "",
    models: listed.map(toOption)
  }
}

const planName = (plan: string | null | undefined) =>
  plan === undefined || plan === null ? "" : ` · ${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`

const base = { id: "claude-code", name: "Claude", account: "", defaultModel: "", models: [] } as const

const toReply = (stdout: string, model: string) => {
  const results = stdout.split("\n").flatMap((line) => {
    const decoded = Schema.decodeUnknownOption(Result)(line.trim())
    return Option.isSome(decoded) ? [decoded.value] : []
  })
  const result = results.at(-1)
  if (result === undefined) return Effect.fail(new ModelFailed({ reason: "invalid_response" }))

  if (result.is_error === true) {
    return /log ?in|401|authenticat/i.test(result.result ?? "")
      ? Effect.fail(new ModelNotConfigured())
      : Effect.fail(new ModelFailed({ reason: "cli_error" }))
  }
  if (result.stop_reason === "refusal") return Effect.fail(new ModelRefused())
  if ((result.result ?? "") === "") return Effect.fail(new ModelFailed({ reason: "empty_reply" }))

  const usage = result.usage
  return Effect.succeed({
    text: result.result ?? "",
    model: Object.keys(result.modelUsage ?? {})[0] ?? model,
    inputTokens:
      (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0),
    outputTokens: usage?.output_tokens ?? 0
  })
}

/** A piece of the reply, with --include-partial-messages. */
const Partial = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.Literal("stream_event"),
    event: Schema.Struct({
      type: Schema.Literal("content_block_delta"),
      delta: Schema.Struct({ type: Schema.Literal("text_delta"), text: Schema.String })
    })
  })
)

/** Tells `onText` the reply so far, line by line of the CLI's output. */
const partialText = (onText: (soFar: string) => Effect.Effect<void>) => {
  let soFar = ""
  return (line: string) => {
    const partial = Schema.decodeUnknownOption(Partial)(line.trim())
    if (Option.isNone(partial)) return Effect.void
    soFar += partial.value.event.delta.text
    return onText(soFar)
  }
}

const replyArgs = (request: ChatRequest, systemFile: string) => [
  "-p",
  ...NO_TOOLS,
  "--no-session-persistence",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  ...(request.onText === undefined ? [] : ["--include-partial-messages"]),
  "--system-prompt-file",
  systemFile,
  // Short conversational replies do not need deep reasoning unless the business asks for it.
  "--effort",
  request.reasoning === "default" ? "low" : request.reasoning,
  ...(request.model === "" ? [] : ["--model", request.model])
]

/** One user message, the only way to hand photos to the CLI. */
const replyInput = (request: ChatRequest) =>
  `${JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "text", text: conversationPrompt(request.turns) },
        ...conversationImages(request.turns).map((image) => ({
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.data }
        }))
      ]
    }
  })}\n`

/** Claude Code, through the account signed in on this machine or an API key. */
export const makeClaudeCodeProvider = (
  cli: LocalCli["Service"],
  keys: Pick<ProviderKeys["Service"], "get">
): ChatProvider => {
  const keyEnv = keys
    .get("claude-code")
    .pipe(
      Effect.map(
        (stored): Record<string, string> =>
          Option.isSome(stored) ? { ANTHROPIC_API_KEY: Redacted.value(stored.value.key) } : {}
      )
    )

  return {
    catalog: Effect.gen(function* () {
      const env = yield* keyEnv
      const hasKey = Object.keys(env).length > 0

      const version = yield* cli.run({ name: "claude", args: ["--version"], timeout: LOOKUP_TIMEOUT })
      const detail = version.stdout.trim()

      const auth = yield* cli.run({ name: "claude", args: ["auth", "status"], timeout: LOOKUP_TIMEOUT })
      const status = Schema.decodeUnknownOption(AuthStatus)(auth.stdout.trim())
      const signedIn = Option.isSome(status) && status.value.loggedIn
      if (!signedIn && !hasKey) {
        return {
          ...base,
          detail,
          hasKey,
          status: "signed-out",
          hint: "Sign in, or add an API key."
        } satisfies ProviderCatalog
      }

      const models = yield* cli.run({
        name: "claude",
        args: ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", ...NO_TOOLS],
        input: `${JSON.stringify({ type: "control_request", request_id: "models", request: { subtype: "initialize" } })}\n`,
        env,
        timeout: LOOKUP_TIMEOUT
      })

      return {
        ...base,
        detail: `${detail}${signedIn ? planName(status.value.subscriptionType) : ""}`,
        account: signedIn ? (status.value.email ?? "") : "",
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
                hint: "Install Claude Code from claude.com/claude-code."
              }) satisfies ProviderCatalog
          )
        )
      )
    ),

    login: Effect.suspend(() => cli.run({ name: "claude", args: ["auth", "login"], timeout: LOGIN_TIMEOUT })).pipe(
      Effect.mapError(() => new ProviderLoginFailed()),
      Effect.flatMap(({ exitCode }) => (exitCode === 0 ? Effect.void : Effect.fail(new ProviderLoginFailed())))
    ),

    reply: Effect.fn("ClaudeCode.reply")(function* (request) {
      if (request.model !== "" && !isModelId(request.model)) return yield* new ModelFailed({ reason: "invalid_model" })

      const env = yield* keyEnv
      const run = cli.inEmptyFolder(request.system, [], (folder) =>
        cli.run({
          name: "claude",
          args: replyArgs(request, folder.systemFile),
          input: replyInput(request),
          cwd: folder.path,
          env,
          timeout: REPLY_TIMEOUT,
          ...(request.onText === undefined ? {} : { onLine: partialText(request.onText) })
        })
      )
      const { stdout } = yield* run.pipe(Effect.mapError(() => new ModelFailed({ reason: "cli_unavailable" })))
      return yield* toReply(stdout, request.model)
    })
  }
}
