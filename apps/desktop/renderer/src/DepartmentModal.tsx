import type { Department } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { useEffect, useState } from "react"
import { DeleteConfirm } from "./DeleteConfirm.tsx"

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground" }

/** What the modal is open for. */
export type DepartmentEditing =
  | { readonly action: "create" }
  | { readonly action: "rename"; readonly department: Department }
  | { readonly action: "delete"; readonly department: Department }

interface DepartmentModalProps {
  /** Empty closes the modal. */
  readonly editing: DepartmentEditing | null
  readonly onCancel: () => void
  /** Resolves to an error message, or null when it is saved. */
  readonly onSave: (name: string, department: Department | null) => Promise<string | null>
  /** Resolves to an error message, or null when it is gone. */
  readonly onDelete: (department: Department) => Promise<string | null>
}

const titleOf = (editing: DepartmentEditing) => {
  if (editing.action === "create") return "New department"
  return editing.action === "rename" ? "Rename department" : "Delete department"
}

export const DepartmentModal = ({ editing, onCancel, onSave, onDelete }: DepartmentModalProps) => {
  // Keeps the content on screen while the modal animates out.
  const [shown, setShown] = useState<DepartmentEditing>({ action: "create" })
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editing === null) return
    setShown(editing)
    setName(editing.action === "create" ? "" : editing.department.name)
    setError(null)
  }, [editing])

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true)
    setError(await action())
    setBusy(false)
  }

  const save = () => {
    if (name.trim() === "" || shown.action === "delete") return
    const department = shown.action === "rename" ? shown.department : null
    void run(() => onSave(name.trim(), department))
  }

  return (
    <CenterMorphModal open={editing !== null} onOpenChange={(open) => !open && onCancel()}>
      <CenterMorphModalContent
        ariaLabel={titleOf(shown)}
        showCloseButton={false}
        dismissible={!busy}
        className="w-full max-w-[400px]"
      >
        {shown.action === "delete" ? (
          <DeleteConfirm
            name={shown.department.name}
            description="Its employees stay and move to Team."
            error={error}
            busy={busy}
            onCancel={onCancel}
            onConfirm={() => void run(() => onDelete(shown.department))}
          />
        ) : (
          <form
            className="flex flex-col gap-4 p-6"
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <h2 className="text-lg font-semibold">{titleOf(shown)}</h2>
            <Input label="Name" value={name} onChange={setName} classNames={inputClasses} />
            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || name.trim() === ""}>
                Save
              </Button>
            </div>
          </form>
        )}
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
