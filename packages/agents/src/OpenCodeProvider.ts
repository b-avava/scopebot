import {
  ModelFailed,
  ModelNotConfigured,
  type ModelOption,
  type ProviderCatalog,
  ReasoningEffort
} from "@scope-bot/domain"
import { Effect, Option, Schema } from "effect"
import type { ChatRequest } from "./ChatModel.ts"
import { conversationImages, conversationPrompt, isModelId, type LocalCli } from "./LocalCli.ts"
import type { ChatProvider } from "./ModelProviders.ts"

const REPLY_TIMEOUT = "120 seconds"
const LOOKUP_TIMEOUT = "20 seconds"

const READ_ONLY_TOOLS = ["read", "grep", "glob", "list"] as const
const DENIED_TOOLS = [
  "edit",
  "write",
  "patch",
  "bash",
  "task",
  "external_directory",
  "todowrite",
  "question",
  "webfetch",
  "websearch",
  "lsp",
  "doom_loop",
  "skill"
] as const

const SANDBOX_CONFIG = JSON.stringify({
  $schema: "https://opencode.ai/config.json",
  permission: Object.fromEntries([
    ...READ_ONLY_TOOLS.map((tool) => [tool, "allow"] as const),
    ...DENIED_TOOLS.map((tool) => [tool, "deny"] as const)
  ])
})

const SYSTEM_FILE = "AGENTS.md"

const DefaultConfig = Schema.fromJsonString(
  Schema.Struct({
    model: Schema.optionalKey(Schema.NullOr(Schema.String))
  })
)

const VerboseModel = Schema.fromJsonString(
  Schema.Struct({
    id: Schema.String,
    providerID: Schema.String,
    name: Schema.String,
    cost: Schema.optionalKey(Schema.Struct({ input: Schema.Number, output: Schema.Number })),
    variants: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown))
  })
)

const Event = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.String,
    part: Schema.optionalKey(
      Schema.Struct({
        id: Schema.optionalKey(Schema.String),
        type: Schema.optionalKey(Schema.String),
        text: Schema.optionalKey(Schema.String),
        tokens: Schema.optionalKey(
          Schema.Struct({
            input: Schema.Number,
            output: Schema.Number,
            cache: Schema.optionalKey(Schema.Struct({ read: Schema.Number, write: Schema.Number }))
          })
        )
      })
    ),
    error: Schema.optionalKey(Schema.Unknown)
  })
)

const TextPart = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.Literal("text"),
    part: Schema.Struct({
      id: Schema.optionalKey(Schema.String),
      type: Schema.Literal("text"),
      text: Schema.String
    })
  })
)

const isEffort = Schema.is(ReasoningEffort)

const toOption = (model: typeof VerboseModel.Type): ModelOption => ({
  id: `${model.providerID}/${model.id}`,
  name: model.name,
  group: model.providerID,
  free: (model.cost?.input ?? 1) === 0 && (model.cost?.output ?? 1) === 0,
  efforts: Object.keys(model.variants ?? {}).filter(isEffort)
})

const parseVerbose = (stdout: string) => {
  const models: Array<ModelOption> = []
  let id: string | null = null
  let block: Array<string> = []

  for (const raw of stdout.split("\n")) {
    const line = raw.trim()
    if (line === "") continue

    if (id === null && !line.startsWith("{")) {
      id = line
      block = []
      continue
    }

    block.push(line)
    if (!line.endsWith("}")) continue

    const decoded = Schema.decodeUnknownOption(VerboseModel)(block.join("\n"))
    if (Option.isSome(decoded)) {
      models.push(toOption(decoded.value))
      id = null
      block = []
    }
  }

  return models
}

const parsePlain = (stdout: string) =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\S+\/\S+$/.test(line))
    .map((id): ModelOption => {
      const slash = id.indexOf("/")
      return {
        id,
        name: id.slice(slash + 1),
        group: id.slice(0, slash),
        free: false,
        efforts: []
      }
    })

const parseModels = (stdout: string) => {
  const verbose = parseVerbose(stdout)
  return verbose.length > 0 ? verbose : parsePlain(stdout)
}

const configuredModel = (stdout: string) => {
  const decoded = Schema.decodeUnknownOption(DefaultConfig)(stdout.trim())
  return Option.isSome(decoded) ? (decoded.value.model ?? "") : ""
}

const base = {
  id: "opencode",
  name: "OpenCode",
  account: "",
  hasKey: false,
  defaultModel: "",
  models: []
} as const

const errorText = (event: typeof Event.Type) => {
  const error = event.error
  if (typeof error === "string") return error
  return error === undefined || error === null ? "" : (JSON.stringify(error) ?? "")
}

const textOf = (events: ReadonlyArray<typeof Event.Type>) => {
  const parts = new Map<string, string>()
  events.forEach((event, index) => {
    const part = event.part
    if (event.type !== "text" || part?.type !== "text" || part.text === undefined) return
    parts.set(part.id ?? `part-${index}`, part.text)
  })
  return [...parts.values()].join("")
}

const usageOf = (events: ReadonlyArray<typeof Event.Type>) =>
  events.reduce(
    (total, event) => {
      const tokens = event.part?.tokens
      if (event.type !== "step_finish" || tokens === undefined) return total
      return {
        input: total.input + tokens.input + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0),
        output: total.output + tokens.output
      }
    },
    { input: 0, output: 0 }
  )

const toReply = (stdout: string, stderr: string, exitCode: number, model: string) => {
  const events = stdout
    .split("\n")
    .map((line) => Schema.decodeUnknownOption(Event)(line.trim()))
    .flatMap((event) => (Option.isSome(event) ? [event.value] : []))

  const failure = events.find((event) => event.type === "error")
  const failureText = failure === undefined ? "" : errorText(failure)
  if (/log ?in|401|unauthorized|authenticat|api key|credential/i.test(`${failureText}\n${stderr}`)) {
    return Effect.fail(new ModelNotConfigured())
  }
  if (failure !== undefined) return Effect.fail(new ModelFailed({ reason: "cli_error" }))
  if (exitCode !== 0) return Effect.fail(new ModelFailed({ reason: `cli_exit_${exitCode}` }))

  const text = textOf(events)
  if (text === "") return Effect.fail(new ModelFailed({ reason: "empty_reply" }))

  const usage = usageOf(events)
  return Effect.succeed({
    text,
    model: model === "" ? "opencode" : model,
    inputTokens: usage.input,
    outputTokens: usage.output
  })
}

const partialText = (onText: (soFar: string) => Effect.Effect<void>) => {
  const parts = new Map<string, string>()
  let index = 0

  return (line: string) => {
    const decoded = Schema.decodeUnknownOption(TextPart)(line.trim())
    if (Option.isNone(decoded)) return Effect.void
    parts.set(decoded.value.part.id ?? `part-${index++}`, decoded.value.part.text)
    return onText([...parts.values()].join(""))
  }
}

const replyArgs = (request: ChatRequest, folder: { readonly imageFiles: ReadonlyArray<string> }) => [
  "run",
  "--pure",
  "--format",
  "json",
  ...(request.model === "" ? [] : ["-m", request.model]),
  ...folder.imageFiles.flatMap((file) => ["--file", file])
]

/** OpenCode, through the providers signed in on the machine that runs the server. */
export const makeOpenCodeProvider = (cli: LocalCli["Service"]): ChatProvider => ({
  catalog: Effect.gen(function* () {
    const version = yield* cli.run({ name: "opencode", args: ["--version"], timeout: LOOKUP_TIMEOUT })
    const detail = version.stdout.trim()

    const listed = yield* cli.run({
      name: "opencode",
      args: ["models", "--verbose"],
      timeout: LOOKUP_TIMEOUT
    })
    if (listed.exitCode !== 0) {
      return {
        ...base,
        detail,
        status: "failed",
        hint: "OpenCode did not list its models."
      } satisfies ProviderCatalog
    }

    const models = parseModels(listed.stdout)
    if (models.length === 0) {
      return {
        ...base,
        detail,
        status: "signed-out",
        hint: "Run `opencode auth login` on this computer."
      } satisfies ProviderCatalog
    }

    const config = yield* cli
      .run({
        name: "opencode",
        args: ["debug", "config"],
        timeout: LOOKUP_TIMEOUT
      })
      .pipe(Effect.option)
    const preferred = Option.isSome(config) ? configuredModel(config.value.stdout) : ""
    const defaultModel = models.some((model) => model.id === preferred) ? preferred : (models[0]?.id ?? "")

    return {
      ...base,
      detail,
      status: "connected",
      hint: "",
      defaultModel,
      models
    } satisfies ProviderCatalog
  }).pipe(
    Effect.catchTag("CliUnavailable", () =>
      Effect.succeed({
        ...base,
        detail: "",
        status: "not-installed",
        hint: "Install OpenCode from https://opencode.ai."
      } satisfies ProviderCatalog)
    )
  ),

  reply: Effect.fn("OpenCode.reply")(function* (request) {
    if (request.model !== "" && !isModelId(request.model)) return yield* new ModelFailed({ reason: "invalid_model" })

    const run = cli.inEmptyFolder(
      request.system,
      conversationImages(request.turns),
      (folder) =>
        cli.run({
          name: "opencode",
          args: replyArgs(request, folder),
          input: conversationPrompt(request.turns),
          cwd: folder.path,
          timeout: REPLY_TIMEOUT,
          ...(request.onText === undefined ? {} : { onLine: partialText(request.onText) })
        }),
      { systemFileName: SYSTEM_FILE, files: { "opencode.json": SANDBOX_CONFIG } }
    )
    const { exitCode, stdout, stderr } = yield* run.pipe(
      Effect.mapError(() => new ModelFailed({ reason: "cli_unavailable" }))
    )
    return yield* toReply(stdout, stderr, exitCode, request.model)
  })
})
