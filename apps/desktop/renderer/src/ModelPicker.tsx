import type { ModelChoice, ModelOption, ProviderCatalog, ProviderId, ReasoningEffort } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger
} from "@scope-bot/ui/components/motion/popover-morph.tsx"
import { Check, ChevronsUpDown, KeyRound, Plus, SlidersHorizontal } from "lucide-react"
import { Fragment, type ReactElement, type ReactNode, useState } from "react"
import { useModels } from "./ModelsContext.tsx"

// Paths from Simple Icons (CC0). They name the provider, like a label would.
const logos: Partial<Record<ProviderId, string>> = {
  "claude-code":
    "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  codex:
    "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
}

export const ProviderIcon = ({ provider, size = 18 }: { readonly provider: ProviderId; readonly size?: number }) => {
  const path = logos[provider]
  if (provider === "custom") return <SlidersHorizontal size={size} aria-hidden />
  return path === undefined ? (
    <KeyRound size={size} aria-hidden />
  ) : (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  )
}

const effortLabels: Record<ReasoningEffort, string> = {
  default: "Default",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max"
}

export const effortLabel = (effort: ReasoningEffort) => effortLabels[effort]

export const findModel = (providers: ReadonlyArray<ProviderCatalog> | null, choice: ModelChoice) => {
  const provider = providers?.find((item) => item.id === choice.provider)
  const id = choice.model === "" ? provider?.defaultModel : choice.model
  return provider?.models.find((model) => model.id === id)
}

export const modelLabel = (providers: ReadonlyArray<ProviderCatalog> | null, choice: ModelChoice) =>
  findModel(providers, choice)?.name ?? (choice.model === "" ? "Default model" : choice.model)

const groupsOf = (models: ReadonlyArray<ModelOption>) => {
  const groups = new Map<string, Array<ModelOption>>()
  for (const model of models) {
    const group = model.free ? "Free" : model.group
    groups.set(group, [...(groups.get(group) ?? []), model])
  }
  return [...groups]
}

const Tag = ({ children }: { readonly children: ReactNode }) => (
  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] leading-4 text-muted-foreground">{children}</span>
)

const ModelRow = ({
  name,
  selected,
  tag,
  onPick
}: {
  readonly name: string
  readonly selected: boolean
  readonly tag?: string
  readonly onPick: () => void
}) => (
  <label className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted has-focus-visible:bg-muted">
    <input type="radio" name="model" checked={selected} onChange={onPick} className="sr-only" />
    <span
      className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border ${
        selected ? "border-foreground bg-foreground text-background" : "border-muted-foreground/50"
      }`}
    >
      {selected && <Check className="size-3" strokeWidth={3} />}
    </span>
    <span className="min-w-0 truncate">{name}</span>
    {tag !== undefined && <Tag>{tag}</Tag>}
  </label>
)

const railClasses = (active: boolean) =>
  `flex size-9 items-center justify-center rounded-control-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
    active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`

const EffortField = ({
  value,
  levels,
  onChange
}: {
  readonly value: ReasoningEffort
  readonly levels: ReadonlyArray<ReasoningEffort>
  readonly onChange: (effort: ReasoningEffort) => void
}) => (
  <label className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[13px] text-muted-foreground">
    Effort
    <span className="relative">
      <select
        aria-label="Effort"
        value={value}
        onChange={(event) => onChange(event.target.value as ReasoningEffort)}
        className="h-8 appearance-none rounded-control-sm bg-muted pl-2.5 pr-7 text-[13px] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {["default" as const, ...levels].map((level) => (
          <option key={level} value={level}>
            {effortLabel(level)}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute top-2 right-2 size-4" />
    </span>
  </label>
)

interface ModelListProps {
  readonly provider: ProviderCatalog
  readonly selected: ModelChoice | null
  readonly hidden: ReadonlyArray<ModelChoice>
  readonly onPick: (choice: ModelChoice, model: ModelOption | undefined) => void
  readonly children?: ReactNode
}

const ModelList = ({ provider, selected, hidden, onPick, children }: ModelListProps) => {
  const [search, setSearch] = useState("")

  const typed = search.trim()
  const models = provider.models.filter(
    (model) =>
      !hidden.some((item) => item.provider === provider.id && item.model === model.id) &&
      `${model.name} ${model.id}`.toLowerCase().includes(typed.toLowerCase())
  )
  // An API provider can have models its list leaves out.
  const canUseTyped = provider.id === "api" && typed !== "" && !models.some((model) => model.id === typed)
  const isSelected = (model: string) => selected?.provider === provider.id && selected.model === model

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-col gap-0.5 px-3 pt-3">
        <p className="text-sm font-semibold">{provider.name}</p>
        <p className="truncate text-xs text-muted-foreground">{provider.detail}</p>
      </div>
      <div className="px-2 pt-2.5">
        <input
          aria-label="Search models"
          placeholder="Search models"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 w-full rounded-control-sm bg-muted px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <fieldset aria-label="Models" className="min-h-0 flex-1 overflow-y-auto border-0 p-1.5">
        {groupsOf(models).map(([group, options]) => (
          <Fragment key={group}>
            {group !== "" && (
              <p className="px-2 pb-1 pt-2 text-xs font-medium capitalize text-muted-foreground">{group}</p>
            )}
            {options.map((option) => (
              <ModelRow
                key={option.id}
                name={option.name}
                selected={isSelected(option.id)}
                {...(option.id === provider.defaultModel ? { tag: "default" } : {})}
                onPick={() => onPick({ provider: provider.id, model: option.id }, option)}
              />
            ))}
          </Fragment>
        ))}
        {canUseTyped && (
          <ModelRow
            name={`Use ${typed}`}
            selected={false}
            onPick={() => onPick({ provider: provider.id, model: typed }, undefined)}
          />
        )}
        {models.length === 0 && !canUseTyped && (
          <p className="p-2 text-[13px] text-muted-foreground">No models found</p>
        )}
      </fieldset>
      {children}
    </div>
  )
}

interface ModelPickerProps {
  /** Null when nothing is picked yet, as when adding a backup. */
  readonly selected: ModelChoice | null
  readonly hidden?: ReadonlyArray<ModelChoice>
  /** Leave out to hide the setting, as for backups. */
  readonly effort?: ReasoningEffort
  readonly onEffortChange?: (effort: ReasoningEffort) => void
  readonly onPick: (choice: ModelChoice, model: ModelOption | undefined) => void
  readonly closeOnPick?: boolean
  readonly side?: "top" | "bottom"
  readonly align?: "start" | "end"
  readonly className?: string
  readonly children: ReactElement
}

export const ModelPicker = ({
  selected,
  hidden = [],
  effort,
  onEffortChange,
  onPick,
  closeOnPick = false,
  side = "top",
  align = "start",
  className = "w-full",
  children
}: ModelPickerProps) => {
  const { all, usable, reload, openProviders } = useModels()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<ProviderId | null>(null)

  const connected = usable ?? []
  const current = connected.find((provider) => provider.id === (page ?? selected?.provider)) ?? connected[0]
  const levels = selected === null ? [] : (findModel(all, selected)?.efforts ?? [])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) {
      setPage(null)
      reload()
    }
  }

  const pick = (choice: ModelChoice, model: ModelOption | undefined) => {
    onPick(choice, model)
    if (closeOnPick) setOpen(false)
  }

  const connect = () => {
    setOpen(false)
    openProviders()
  }

  return (
    <MorphPopover open={open} onOpenChange={changeOpen} className={className}>
      <MorphPopoverTrigger>{children}</MorphPopoverTrigger>
      <MorphPopoverContent side={side} align={align} radius={12}>
        <div className="flex h-[440px] w-[380px] overflow-hidden">
          <nav aria-label="Providers" className="flex w-13 shrink-0 flex-col items-center gap-1 border-r p-2">
            {connected.map((provider) => (
              <button
                key={provider.id}
                type="button"
                aria-label={provider.name}
                aria-pressed={provider.id === current?.id}
                onClick={() => setPage(provider.id)}
                className={railClasses(provider.id === current?.id)}
              >
                <ProviderIcon provider={provider.id} />
              </button>
            ))}
            <button type="button" aria-label="Connect a provider" onClick={connect} className={railClasses(false)}>
              <Plus className="size-4.5" />
            </button>
          </nav>

          {usable === null && <p className="p-4 text-[13px] text-muted-foreground">Looking for providers…</p>}
          {usable !== null && current === undefined && (
            <div className="flex flex-1 flex-col items-start gap-3 p-4">
              <p className="text-[13px] text-muted-foreground">No provider is connected yet.</p>
              <Button size="sm" variant="outline" onClick={connect}>
                Connect a provider
              </Button>
            </div>
          )}
          {current !== undefined && (
            <ModelList key={current.id} provider={current} selected={selected} hidden={hidden} onPick={pick}>
              {effort !== undefined && levels.length > 0 && (
                <EffortField value={effort} levels={levels} onChange={(next) => onEffortChange?.(next)} />
              )}
            </ModelList>
          )}
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  )
}
