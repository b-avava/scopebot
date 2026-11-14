import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"

interface DeleteConfirmProps {
  readonly name: string
  /** What deleting does. */
  readonly description: string
  readonly error: string | null
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

/** The question a modal shows before it deletes something. */
export const DeleteConfirm = ({ name, description, error, busy, onCancel, onConfirm }: DeleteConfirmProps) => (
  <div className="flex flex-col gap-2 p-6">
    <h2 className="text-lg font-semibold">Delete {name}?</h2>
    <p className="text-sm leading-5 text-muted-foreground">{description}</p>
    {error !== null && (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )}
    {/* Cancel comes first, so Enter cannot delete by accident. */}
    <div className="mt-4 flex justify-end gap-2">
      <Button variant="outline" disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
      <Button disabled={busy} className="bg-destructive text-white hover:bg-destructive" onClick={onConfirm}>
        Delete
      </Button>
    </div>
  </div>
)
