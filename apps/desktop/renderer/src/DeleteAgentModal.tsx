import type { Agent } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { useEffect, useState } from "react"

interface DeleteAgentModalProps {
  /** The agent waiting for confirmation. Empty closes the modal. */
  readonly agent: Agent | null
  readonly onCancel: () => void
  /** Resolves to an error message, or null when the agent is gone. */
  readonly onConfirm: (agent: Agent) => Promise<string | null>
}

export const DeleteAgentModal = ({ agent, onCancel, onConfirm }: DeleteAgentModalProps) => {
  // Keeps the name on screen while the modal animates out.
  const [shown, setShown] = useState(agent)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (agent === null) return
    setShown(agent)
    setError(null)
  }, [agent])

  const confirm = async () => {
    if (agent === null) return
    setDeleting(true)
    setError(await onConfirm(agent))
    setDeleting(false)
  }

  return (
    <CenterMorphModal open={agent !== null} onOpenChange={(open) => !open && onCancel()}>
      <CenterMorphModalContent
        ariaLabel={`Delete ${shown?.name ?? "employee"}`}
        ariaDescribedBy="delete-agent-description"
        showCloseButton={false}
        dismissible={!deleting}
        className="w-full max-w-[400px]"
      >
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-lg font-semibold">Delete {shown?.name}?</h2>
          <p id="delete-agent-description" className="text-sm leading-5 text-muted-foreground">
            This removes the employee with their chat and activity. It cannot be undone.
          </p>
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {/* Cancel comes first, so it takes the initial focus and Enter cannot delete by accident. */}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" disabled={deleting} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive"
              onClick={() => void confirm()}
            >
              Delete
            </Button>
          </div>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
