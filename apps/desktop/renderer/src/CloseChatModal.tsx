import type { ConversationSummary } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { useEffect, useState } from "react"

interface CloseChatModalProps {
  /** The chat waiting for confirmation. Empty closes the modal. */
  readonly chat: ConversationSummary | null
  readonly onCancel: () => void
  readonly onConfirm: (chat: ConversationSummary) => void
}

export const CloseChatModal = ({ chat, onCancel, onConfirm }: CloseChatModalProps) => {
  // Keeps the name on screen while the modal animates out.
  const [shown, setShown] = useState(chat)

  useEffect(() => {
    if (chat !== null) setShown(chat)
  }, [chat])

  return (
    <CenterMorphModal open={chat !== null} onOpenChange={(open) => !open && onCancel()}>
      <CenterMorphModalContent
        ariaLabel={`Delete ${shown?.title ?? "chat"}`}
        ariaDescribedBy="close-chat-description"
        showCloseButton={false}
        className="w-full max-w-[400px]"
      >
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-lg font-semibold">Delete “{shown?.title}”?</h2>
          <p id="close-chat-description" className="text-sm leading-5 text-muted-foreground">
            The messages are removed, and the employee will no longer remember them. It cannot be undone.
          </p>
          {/* Cancel comes first, so it takes the initial focus and Enter cannot delete by accident. */}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive"
              onClick={() => chat !== null && onConfirm(chat)}
            >
              Delete
            </Button>
          </div>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
