import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@scope-bot/ui/components/motion/select.tsx"
import type { CreateAgent } from "@scope-bot/domain"
import { useState } from "react"
import { AvatarPicker, type AvatarLook } from "./AvatarPicker.tsx"
import { LiveMascot, Mascot, watchArea } from "./Mascot.tsx"
import { defaultLook, jobs } from "./sampleData.ts"
import { TitleBar } from "./TitleBar.tsx"

interface HireScreenProps {
  readonly onHire: (input: CreateAgent) => Promise<string | null>
}

export const HireScreen = ({ onHire }: HireScreenProps) => {
  const [name, setName] = useState("")
  const [job, setJob] = useState<string>(jobs[0])
  const [look, setLook] = useState<AvatarLook>(defaultLook)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedName = name.trim()

  const hire = async () => {
    setSaving(true)
    setError(null)
    setError(await onHire({ name: trimmedName, job, ...look }))
    setSaving(false)
  }

  return (
    <>
      <TitleBar>
        <Mascot size={20} {...look} />
        <span className="text-sm font-semibold">New employee</span>
      </TitleBar>

      <div {...watchArea} className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-6 py-6">
          <LiveMascot size={200} {...look} />

          <div className="flex w-full max-w-[340px] flex-col gap-3.5">
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
                  {jobs.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button disabled={trimmedName === "" || saving} onClick={() => void hire()}>
            {trimmedName === "" ? "Hire" : `Hire ${trimmedName}`}
          </Button>

          {error !== null && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <aside className="w-[min(440px,48%)] shrink-0 overflow-y-auto border-l p-5">
          <AvatarPicker value={look} onChange={setLook} />
        </aside>
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
