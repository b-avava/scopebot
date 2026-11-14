import type { Deal, Stage } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { useEffect, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { toDealDetails } from "./crmStats.ts"
import { errorMessage } from "./hooks.ts"

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground" }

/** Asks why a deal was lost, because that is what the business learns from. */
export const LostModal = ({
  losing,
  onClose
}: {
  /** Empty closes the modal. */
  readonly losing: { readonly deal: Deal; readonly stage: Stage } | null
  readonly onClose: () => void
}) => {
  const { saveDeal } = useCrm()
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")

  useEffect(() => {
    if (losing === null) return
    setTitle(losing.deal.title)
    setReason(losing.deal.lostReason)
    setError(null)
  }, [losing])

  const save = async () => {
    if (losing === null) return
    const details = { ...toDealDetails(losing.deal), stageId: losing.stage.id, lostReason: reason.trim() }
    const result = await saveDeal(details, losing.deal.id)
    if (result.ok) onClose()
    else setError(errorMessage(result.error))
  }

  return (
    <CenterMorphModal open={losing !== null} onOpenChange={(open) => !open && onClose()}>
      <CenterMorphModalContent ariaLabel={`Lost: ${title}`} showCloseButton={false} className="w-full max-w-[400px]">
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <h2 className="text-lg font-semibold">Why was {title} lost?</h2>
          <Input
            label="Reason"
            placeholder="Price, timing, chose another"
            value={reason}
            onChange={setReason}
            classNames={inputClasses}
          />
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Mark as lost</Button>
          </div>
        </form>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
