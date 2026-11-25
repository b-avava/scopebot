import { Schema } from "effect"

/** How hard a model thinks. `default` leaves the choice to the server. */
export const ReasoningEffort = Schema.Literals(["default", "low", "medium", "high", "xhigh", "max"])
export type ReasoningEffort = typeof ReasoningEffort.Type

/**
 * Where a model runs: `api` is the key in `.env`, `claude-code`, `codex` and `opencode`
 * are CLIs on the machine that runs the server, the rest take a key added in the app.
 */
export const ProviderId = Schema.Literals([
  "api",
  "claude-code",
  "codex",
  "opencode",
  "openrouter",
  "deepseek",
  "custom"
])
export type ProviderId = typeof ProviderId.Type

export const ModelChoice = Schema.Struct({
  provider: ProviderId,
  /** Empty uses the provider's default. */
  model: Schema.String
})
export type ModelChoice = typeof ModelChoice.Type

/** One model a provider offers. */
export const ModelOption = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The lab behind the model on providers that resell several. Empty otherwise. */
  group: Schema.String,
  free: Schema.Boolean,
  /** Levels the model accepts. Empty means it has no such setting. */
  efforts: Schema.Array(ReasoningEffort)
})
export type ModelOption = typeof ModelOption.Type

/** What `ChatModel` can say about the key in `.env`. */
export const ModelCatalog = Schema.Struct({
  /** Used by agents without their own model. Empty when the server has none. */
  defaultModel: Schema.String,
  models: Schema.Array(ModelOption)
})
export type ModelCatalog = typeof ModelCatalog.Type

export const ProviderStatus = Schema.Literals(["connected", "signed-out", "not-installed", "failed"])
export type ProviderStatus = typeof ProviderStatus.Type

/** A provider as seen from the machine running the server. */
export const ProviderCatalog = Schema.Struct({
  id: ProviderId,
  name: Schema.String,
  /** Version and plan, or the address of the API. */
  detail: Schema.String,
  /** Who is signed in. Empty when the provider does not say. */
  account: Schema.String,
  /** The key itself never leaves the server. */
  hasKey: Schema.Boolean,
  status: ProviderStatus,
  /** What to do when the provider is not connected. */
  hint: Schema.String,
  ...ModelCatalog.fields
})
export type ProviderCatalog = typeof ProviderCatalog.Type

/** What a person chose on the providers page. */
export const ProviderPreferences = Schema.Struct({
  /** Null starts new agents on the first connected provider. */
  defaultProvider: Schema.NullOr(ProviderId),
  /** Switched off: these leave the model picker. */
  disabled: Schema.Array(ProviderId),
  hiddenModels: Schema.Array(ModelChoice)
})
export type ProviderPreferences = typeof ProviderPreferences.Type

export const emptyProviderPreferences: ProviderPreferences = { defaultProvider: null, disabled: [], hiddenModels: [] }

export const ProviderKey = Schema.Struct({
  key: Schema.NonEmptyString,
  /** Only for a provider without an address of its own. */
  baseUrl: Schema.optionalKey(Schema.String)
})
export type ProviderKey = typeof ProviderKey.Type

export class ProviderLoginFailed extends Schema.TaggedError<ProviderLoginFailed>()(
  "ProviderLoginFailed",
  {},
  { httpApiStatus: 502 }
) {}
