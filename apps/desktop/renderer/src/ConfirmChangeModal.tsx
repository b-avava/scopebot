import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { useEffect, useState } from "react"

export interface RiskyChange {
  readonly title: string
  readonly description: string
  readonly apply: () => void
}

interface ConfirmChangeModalProps {
  /** Empty closes the modal. */
  readonly change: RiskyChange | null
  readonly onCancel: () => void
}

/** Asks before a setting gives an employee more freedom. */
export const ConfirmChangeModal = ({ change, onCancel }: ConfirmChangeModalProps) => {
  // Keeps the text on screen while the modal animates out.
  const [shown, setShown] = useState(change)

  useEffect(() => {
    if (change !== null) setShown(change)
  }, [change])

  return (
    <CenterMorphModal open={change !== null} onOpenChange={(open) => !open && onCancel()}>
      <CenterMorphModalContent
        ariaLabel={shown?.title ?? "Confirm change"}
        ariaDescribedBy="confirm-change-description"
        showCloseButton={false}
        className="w-full max-w-[400px]"
      >
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-lg font-semibold">{shown?.title}</h2>
          <p id="confirm-change-description" className="text-sm leading-5 text-muted-foreground">
            {shown?.description}
          </p>
          {/* Cancel comes first, so it takes the initial focus and Enter cannot allow it by accident. */}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => change?.apply()}>Allow</Button>
          </div>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
