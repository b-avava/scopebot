import { type AgentSettings, MAX_BACKUP_MODELS, type ModelOption, type ReasoningEffort } from "@scope-bot/domain"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@scope-bot/ui/components/motion/select.tsx"
import { X } from "lucide-react"
import { Fragment, useState } from "react"
import { errorMessage, useModels } from "./hooks.ts"

type ModelFields = Pick<AgentSettings, "model" | "reasoning" | "backupModels">

interface ModelSettingsProps {
  readonly value: ModelFields
  readonly onChange: (patch: Partial<ModelFields>) => void
}

// An empty value cannot identify a row in the list.
const SERVER_DEFAULT = "server-default"

const efforts: ReadonlyArray<{ readonly value: ReasoningEffort; readonly label: string }> = [
  { value: "default", label: "Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
]

const labelClasses = "text-[13px] font-medium text-muted-foreground"
const hintClasses = "text-[13px] leading-[18px] text-muted-foreground"

const modelLabel = (option: ModelOption) => (option.free ? `${option.name} · Free` : option.name)

const groupsOf = (models: ReadonlyArray<ModelOption>) => {
  const groups = new Map<string, Array<ModelOption>>()
  for (const model of models) {
    const group = model.free ? "Free" : model.group
    groups.set(group, [...(groups.get(group) ?? []), model])
  }
  return [...groups]
}

const ModelOptions = ({ models }: { readonly models: ReadonlyArray<ModelOption> }) =>
  groupsOf(models).map(([group, options]) => (
    <Fragment key={group}>
      {group !== "" && <p className="px-2.5 pb-1 pt-2 text-xs font-medium capitalize text-muted-foreground">{group}</p>}
      {options.map((option) => (
        <SelectItem key={option.id} value={option.id}>
          {modelLabel(option)}
        </SelectItem>
      ))}
    </Fragment>
  ))

/** A saved model the provider no longer lists must still show as selected. */
const withCurrent = (models: ReadonlyArray<ModelOption>, current: string) =>
  current === "" || models.some((model) => model.id === current)
    ? models
    : [{ id: current, name: current, group: "", free: false }, ...models]

export const ModelSettings = ({ value, onChange }: ModelSettingsProps) => {
  const catalog = useModels()
  const [openSelect, setOpenSelect] = useState<"model" | "backup" | null>(null)
  const available = catalog?.ok === true ? catalog.value : null

  const nameOf = (id: string) => available?.models.find((model) => model.id === id)?.name ?? id
  const backupChoices = (available?.models ?? []).filter(
    (model) => model.id !== value.model && !value.backupModels.includes(model.id)
  )
  const defaultLabel =
    available === null || available.defaultModel === ""
      ? "Server default"
      : `Server default (${nameOf(available.defaultModel)})`

  return (
    <>
      {available === null ? (
        <div className="flex flex-col gap-1.5">
          <Input
            label="Model"
            placeholder="Server default"
            value={value.model}
            onChange={(model) => onChange({ model: model.trim() })}
            classNames={{ label: "px-0 text-[13px] text-muted-foreground", field: "rounded-xl" }}
          />
          {catalog?.ok === false && (
            <p className={hintClasses}>Could not load the list of models. {errorMessage(catalog.error)}</p>
          )}
        </div>
      ) : (
        <div className={`flex flex-col gap-1.5 ${openSelect === "model" ? "relative z-20" : ""}`}>
          <span className={labelClasses}>Model</span>
          <Select
            value={value.model === "" ? SERVER_DEFAULT : value.model}
            onValueChange={(model) => onChange({ model: model === SERVER_DEFAULT ? "" : model })}
            open={openSelect === "model"}
            onOpenChange={(open) => setOpenSelect(open ? "model" : null)}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto">
              <SelectItem value={SERVER_DEFAULT}>{defaultLabel}</SelectItem>
              <ModelOptions models={withCurrent(available.models, value.model)} />
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className={labelClasses}>Reasoning</span>
        <div className="flex gap-1.5">
          {efforts.map((effort) => (
            <button
              key={effort.value}
              type="button"
              aria-pressed={effort.value === value.reasoning}
              onClick={() => onChange({ reasoning: effort.value })}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
                effort.value === value.reasoning
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {effort.label}
            </button>
          ))}
        </div>
        <p className={hintClasses}>
          Higher takes longer and costs more. Some models do not support this and will fail.
        </p>
      </div>

      <div className={`flex flex-col gap-1.5 ${openSelect === "backup" ? "relative z-20" : ""}`}>
        <span className={labelClasses}>Backup models</span>
        {value.backupModels.length > 0 && (
          <ol className="flex flex-col gap-1">
            {value.backupModels.map((model, index) => (
              <li key={model} className="flex h-10 items-center gap-3 rounded-xl bg-muted pl-3 pr-1 text-sm">
                <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{nameOf(model)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${nameOf(model)}`}
                  onClick={() => onChange({ backupModels: value.backupModels.filter((item) => item !== model) })}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
        {available !== null && value.backupModels.length < MAX_BACKUP_MODELS && (
          <Select
            value=""
            onValueChange={(model) => onChange({ backupModels: [...value.backupModels, model] })}
            open={openSelect === "backup"}
            onOpenChange={(open) => setOpenSelect(open ? "backup" : null)}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Add a backup" />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto">
              <ModelOptions models={backupChoices} />
            </SelectContent>
          </Select>
        )}
        {available === null && value.backupModels.length === 0 && (
          <p className={hintClasses}>Available once the list of models loads.</p>
        )}
      </div>
    </>
  )
}
