import { type Pipeline, type Stage, StageId } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { fieldClasses } from "./CrmParts.tsx"
import { errorMessage } from "./hooks.ts"

const kindLabels = { open: "Open", won: "Won", lost: "Lost" } as const

const iconButton =
  "flex size-8 shrink-0 items-center justify-center rounded-control-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"

export const StagesModal = ({
  open,
  pipeline,
  onClose
}: {
  readonly open: boolean
  readonly pipeline: Pipeline
  readonly onClose: () => void
}) => {
  const { savePipeline } = useCrm()
  const [stages, setStages] = useState<ReadonlyArray<Stage>>(pipeline.stages)
  const [name, setName] = useState(pipeline.name)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStages(pipeline.stages)
    setName(pipeline.name)
    setError(null)
  }, [open, pipeline])

  const change = (id: string, patch: Partial<Stage>) =>
    setStages(stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)))

  const shift = (index: number, step: number) => {
    const next = [...stages]
    const [moved] = next.splice(index, 1)
    if (moved === undefined) return
    next.splice(index + step, 0, moved)
    setStages(next)
  }

  const add = () => {
    const firstClosed = stages.findIndex((stage) => stage.kind !== "open")
    const at = firstClosed < 0 ? stages.length : firstClosed
    const stage: Stage = { id: StageId.make(crypto.randomUUID()), name: "New stage", kind: "open", probability: 30 }
    setStages([...stages.slice(0, at), stage, ...stages.slice(at)])
  }

  const save = async () => {
    const result = await savePipeline(pipeline.id, { name: name.trim(), stages })
    if (result.ok) onClose()
    else setError(errorMessage(result.error))
  }

  const valid = name.trim() !== "" && stages.every((stage) => stage.name.trim() !== "")

  return (
    <CenterMorphModal open={open} onOpenChange={(next) => !next && onClose()}>
      <CenterMorphModalContent ariaLabel="Edit stages" showCloseButton={false} className="w-full max-w-[520px]">
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">Edit stages</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">Funnel name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClasses} />
          </label>

          <ul className="flex flex-col gap-1.5">
            {stages.map((stage, index) => (
              <li key={stage.id} className="flex items-center gap-1.5">
                <input
                  aria-label="Stage name"
                  value={stage.name}
                  onChange={(event) => change(stage.id, { name: event.target.value })}
                  className={fieldClasses}
                />
                <span className="w-10 shrink-0 text-center text-xs text-muted-foreground">
                  {kindLabels[stage.kind]}
                </span>
                <label className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
                  <input
                    aria-label={`Usual chance for ${stage.name}`}
                    type="number"
                    min={0}
                    max={100}
                    value={stage.probability}
                    onChange={(event) =>
                      change(stage.id, { probability: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })
                    }
                    className="h-9 w-14 rounded-control-sm border bg-field px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  %
                </label>
                <button
                  type="button"
                  aria-label={`Move ${stage.name} up`}
                  disabled={index === 0}
                  onClick={() => shift(index, -1)}
                  className={iconButton}
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${stage.name} down`}
                  disabled={index === stages.length - 1}
                  onClick={() => shift(index, 1)}
                  className={iconButton}
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${stage.name}`}
                  onClick={() => setStages(stages.filter((item) => item.id !== stage.id))}
                  className={iconButton}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <div>
            <Button size="sm" variant="outline" onClick={add}>
              <Plus className="size-4" />
              Add a stage
            </Button>
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!valid} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
