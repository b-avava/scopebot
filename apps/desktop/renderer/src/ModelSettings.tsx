import { type AgentSettings, MAX_BACKUP_MODELS, type ModelChoice, type ModelOption } from "@scope-bot/domain"
import { ChevronDown, Plus, X } from "lucide-react"
import { effortLabel, ModelPicker, modelLabel, ProviderIcon } from "./ModelPicker.tsx"
import { useModels } from "./ModelsContext.tsx"

export type ModelFields = Pick<AgentSettings, "provider" | "model" | "reasoning">

interface ModelFieldProps {
  readonly value: ModelFields
  readonly onChange: (patch: Partial<ModelFields>) => void
  /** The small version for the title bar. */
  readonly compact?: boolean
  readonly side?: "top" | "bottom"
}

/** The model with its picker, used when hiring, in settings and above a chat. */
export const ModelField = ({ value, onChange, compact = false, side = "top" }: ModelFieldProps) => {
  const { all } = useModels()

  const pick = (choice: ModelChoice, model: ModelOption | undefined) =>
    onChange({
      ...choice,
      // A level the new model does not know would fail every reply.
      ...(model?.efforts.includes(value.reasoning) === true ? {} : { reasoning: "default" as const })
    })

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      {all !== null && <ProviderIcon provider={value.provider} size={16} />}
      <span className="truncate font-medium">{all === null ? "Loading…" : modelLabel(all, value)}</span>
      {all !== null && <span className="shrink-0 text-muted-foreground">· {effortLabel(value.reasoning)}</span>}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </span>
  )

  return (
    <ModelPicker
      selected={value}
      effort={value.reasoning}
      onEffortChange={(reasoning) => onChange({ reasoning })}
      onPick={pick}
      side={compact ? "bottom" : side}
      {...(compact ? { align: "end", className: "max-w-80" } : {})}
    >
      {compact ? (
        <button
          type="button"
          aria-label="Model"
          className="flex h-8 max-w-80 items-center rounded-lg px-2 text-[13px] outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          {summary}
        </button>
      ) : (
        <button
          type="button"
          className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-background px-3 text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-muted-foreground">Model</span>
          {summary}
        </button>
      )}
    </ModelPicker>
  )
}

type BackupFields = ModelFields & Pick<AgentSettings, "backupModels">

interface BackupModelsProps {
  readonly value: BackupFields
  readonly onChange: (patch: Pick<AgentSettings, "backupModels">) => void
}

export const BackupModels = ({ value, onChange }: BackupModelsProps) => {
  const { all } = useModels()
  const isSame = (first: ModelChoice, second: ModelChoice) =>
    first.provider === second.provider && first.model === second.model

  return (
    <div className="flex flex-col gap-1.5">
      {value.backupModels.length > 0 && (
        <ol className="flex flex-col gap-1">
          {value.backupModels.map((backup, index) => {
            const name = modelLabel(all, backup)
            return (
              <li
                key={`${backup.provider}:${backup.model}`}
                className="flex h-10 items-center gap-3 rounded-xl bg-muted pl-3 pr-1 text-sm"
              >
                <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{index + 1}</span>
                <ProviderIcon provider={backup.provider} size={16} />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange({ backupModels: value.backupModels.filter((item) => !isSame(item, backup)) })}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {value.backupModels.length < MAX_BACKUP_MODELS && (
        <ModelPicker
          selected={null}
          hidden={[value, ...value.backupModels]}
          onPick={(choice) => onChange({ backupModels: [...value.backupModels, choice] })}
          closeOnPick
          side="bottom"
        >
          <button
            type="button"
            className="flex h-11 w-full items-center gap-2 rounded-xl border bg-background px-3 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4" />
            Add a backup
          </button>
        </ModelPicker>
      )}
    </div>
  )
}
