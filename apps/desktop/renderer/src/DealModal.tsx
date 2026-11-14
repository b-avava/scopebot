import { emptyDealDetails, type Pipeline, type Stage } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { useEffect, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { ownerOptions } from "./CrmParts.tsx"
import { errorMessage } from "./hooks.ts"

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground" }
const selectClasses =
  "h-11 w-full rounded-control border bg-field px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelClasses = "text-[13px] font-medium text-muted-foreground"

/** A whole number or one with up to two decimals, with a dot or a comma. Empty means zero. */
const AMOUNT = /^\d*([.,]\d{0,2})?$/

const parseAmount = (text: string) => Number(text.replace(",", ".")) || 0

export interface DealCreating {
  readonly stage: Stage
  /** Fills in the contact when the deal starts from one. */
  readonly contactId?: string
}

export const DealModal = ({
  creating,
  pipeline,
  onClose,
  onCreated
}: {
  /** Empty closes the modal. */
  readonly creating: DealCreating | null
  readonly pipeline: Pipeline
  readonly onClose: () => void
  readonly onCreated: (id: string) => void
}) => {
  const { agents, contacts, saveDeal } = useCrm()
  const [title, setTitle] = useState("")
  const [stageId, setStageId] = useState("")
  const [contactId, setContactId] = useState("")
  const [ownerId, setOwnerId] = useState("you")
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (creating === null) return
    setTitle("")
    setStageId(creating.stage.id)
    setContactId(creating.contactId ?? "")
    setOwnerId("you")
    setAmount("")
    setError(null)
  }, [creating])

  const people = [...contacts].sort((first, second) => first.name.localeCompare(second.name))

  const save = async () => {
    const stage = pipeline.stages.find((item) => item.id === stageId)
    if (stage === undefined) return
    setBusy(true)
    const result = await saveDeal(
      {
        ...emptyDealDetails,
        title: title.trim(),
        pipelineId: pipeline.id,
        stageId: stage.id,
        contactId: people.find((item) => item.id === contactId)?.id ?? null,
        ownerId: agents.find((item) => item.id === ownerId)?.id ?? null,
        amount: parseAmount(amount)
      },
      null
    )
    setBusy(false)
    if (result.ok) onCreated(result.value.id)
    else setError(errorMessage(result.error))
  }

  return (
    <CenterMorphModal open={creating !== null} onOpenChange={(open) => !open && onClose()}>
      <CenterMorphModalContent
        ariaLabel="New deal"
        showCloseButton={false}
        dismissible={!busy}
        className="w-full max-w-[440px]"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (title.trim() !== "") void save()
          }}
        >
          <h2 className="text-lg font-semibold">New deal</h2>
          <Input label="Title" value={title} onChange={setTitle} classNames={inputClasses} />

          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelClasses}>Stage</span>
              <select value={stageId} onChange={(event) => setStageId(event.target.value)} className={selectClasses}>
                {pipeline.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelClasses}>Contact</span>
              <select
                value={contactId}
                onChange={(event) => setContactId(event.target.value)}
                className={selectClasses}
              >
                <option value="">No contact</option>
                {people.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount"
              inputMode="decimal"
              value={amount}
              onChange={(value) => {
                if (AMOUNT.test(value)) setAmount(value)
              }}
              classNames={inputClasses}
            />
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelClasses}>Owner</span>
              <select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className={selectClasses}>
                {ownerOptions(agents).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || title.trim() === ""}>
              Save
            </Button>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
