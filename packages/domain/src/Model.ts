import { Schema } from "effect"

/** How hard a model thinks. `default` leaves the choice to the server. */
export const ReasoningEffort = Schema.Literals(["default", "low", "medium", "high"])
export type ReasoningEffort = typeof ReasoningEffort.Type

/** One model the configured provider offers. */
export const ModelOption = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The lab behind the model on providers that resell several. Empty otherwise. */
  group: Schema.String,
  free: Schema.Boolean
})
export type ModelOption = typeof ModelOption.Type

export const ModelCatalog = Schema.Struct({
  /** Used by agents without their own model. Empty when the server has none. */
  defaultModel: Schema.String,
  models: Schema.Array(ModelOption)
})
export type ModelCatalog = typeof ModelCatalog.Type
