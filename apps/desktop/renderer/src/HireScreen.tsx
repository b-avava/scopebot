import type { CreateAgent, ProviderCatalog, ProviderPreferences } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@scope-bot/ui/components/motion/select.tsx"
import { useState } from "react"
import { type AvatarLook, AvatarPicker } from "./AvatarPicker.tsx"
import { LiveMascot, Mascot, watchArea } from "./Mascot.tsx"
import { ModelField, type ModelFields } from "./ModelSettings.tsx"
import { useModels } from "./ModelsContext.tsx"
import { defaultLook, jobs } from "./sampleData.ts"
import { TitleBar } from "./TitleBar.tsx"

interface HireScreenProps {
  readonly onHire: (input: CreateAgent) => Promise<string | null>
}

/** Starts on the default provider, or else the first one that works. */
const startingModel = (
  usable: ReadonlyArray<ProviderCatalog> | null,
  preferences: ProviderPreferences
): ModelFields => {
  const ready = usable?.filter((item) => item.models.length > 0) ?? []
  const provider = ready.find((item) => item.id === preferences.defaultProvider) ?? ready[0]
  const listed = provider?.models.some((model) => model.id === provider.defaultModel) === true
  return {
    provider: provider?.id ?? "api",
    model: listed ? (provider?.defaultModel ?? "") : (provider?.models[0]?.id ?? ""),
    reasoning: "default"
  }
}

export const HireScreen = ({ onHire }: HireScreenProps) => {
  const [name, setName] = useState("")
  const [job, setJob] = useState<string>(jobs[0])
  const [look, setLook] = useState<AvatarLook>(defaultLook)
  const { usable, preferences } = useModels()
  const [picked, setPicked] = useState<ModelFields | null>(null)
  const model = picked ?? startingModel(usable, preferences)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()

  const hire = async () => {
    setSaving(true)
    setError(null)
    setError(await onHire({ name: trimmedName, job, ...look, ...model }))
    setSaving(false)
  }

  return (
    <>
      <TitleBar>
        <Mascot size={20} {...look} />
        <span className="text-sm font-semibold">New employee</span>
      </TitleBar>

      <div {...watchArea} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[476px] flex-col items-center justify-center gap-5 px-6 py-6">
          <LiveMascot size={120} {...look} />

          <AvatarPicker value={look} onChange={setLook} />

          <div className="flex w-full flex-col gap-3.5">
            <Input
              label="Name"
              placeholder="Nino"
              value={name}
              onChange={setName}
              classNames={{ label: "px-0 text-[13px] text-muted-foreground", field: "rounded-xl" }}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted-foreground">Job</span>
              <Select value={job} onValueChange={setJob}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choose a job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ModelField value={model} onChange={(patch) => setPicked({ ...model, ...patch })} />
          </div>

          <Button disabled={trimmedName === "" || saving} onClick={() => void hire()}>
            {trimmedName === "" ? "Hire" : `Hire ${trimmedName}`}
          </Button>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Suggestions are hidden for now. To restore them, import `suggestions` from sampleData.ts.
      <section className="shrink-0 pb-6 pl-6">
        <h2 className="mb-2.5 text-[13px] font-medium text-muted-foreground">Suggestions</h2>
        <div className="flex gap-3 overflow-x-auto pr-6 [scrollbar-width:none]">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => {
                setName(suggestion.name)
                setJob(suggestion.job)
                setLook(suggestion.look)
              }}
              className="flex w-[340px] shrink-0 items-center gap-3.5 rounded-[14px] border p-4 text-left transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Mascot size={44} {...suggestion.look} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] leading-5 font-semibold">{suggestion.title}</span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">{suggestion.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      */}
    </>
  )
}
