import { type Contact, type ContactDetails, type ContactKind, emptyContactDetails } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { useEffect, useRef, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { ownerOptions } from "./CrmParts.tsx"
import { toContactDetails } from "./crmStats.ts"
import { DeleteConfirm } from "./DeleteConfirm.tsx"

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground" }
const selectClasses =
  "h-11 w-full rounded-control border bg-field px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelClasses = "text-[13px] font-medium text-muted-foreground"

const kinds: ReadonlyArray<{ readonly value: ContactKind; readonly label: string }> = [
  { value: "person", label: "Person" },
  { value: "company", label: "Company" }
]

const emptyDetails: ContactDetails = { ...emptyContactDetails, name: "" }

const toDetails = (draft: ContactDetails, tags: string): ContactDetails => ({
  ...draft,
  name: draft.name.trim(),
  role: draft.role.trim(),
  language: draft.language.trim(),
  bestTime: draft.bestTime.trim(),
  source: draft.source.trim(),
  channels: {
    phone: draft.channels.phone.trim(),
    whatsapp: draft.channels.whatsapp.trim(),
    telegram: draft.channels.telegram.trim()
  },
  tags: [
    ...new Set(
      tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "")
    )
  ]
})

const ConsentRow = ({
  label,
  checked,
  onChange
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm">{label}</span>
    <Switch ariaLabel={label} checked={checked} onCheckedChange={onChange} />
  </div>
)

/** What the modal is open for. An empty contact means a new one. */
export interface ContactEditing {
  readonly contact: Contact | null
}

interface ContactModalProps {
  /** Empty closes the modal. */
  readonly editing: ContactEditing | null
  readonly onCancel: () => void
  /** Resolves to an error message, or null when the contact is saved. */
  readonly onSave: (details: ContactDetails, contact: Contact | null) => Promise<string | null>
  /** Resolves to an error message, or null when the contact is gone. */
  readonly onDelete: (contact: Contact) => Promise<string | null>
}

export const ContactModal = ({ editing, onCancel, onSave, onDelete }: ContactModalProps) => {
  const { agents, contacts } = useCrm()
  const [draft, setDraft] = useState(emptyDetails)
  const [tags, setTags] = useState("")
  // Keeps the contact on screen while the modal animates out.
  const [shown, setShown] = useState<Contact | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const viewRef = useRef<HTMLDivElement>(null)

  // The button that switched the view is gone, so focus moves to the new view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the view switches.
  useEffect(() => {
    viewRef.current?.querySelector<HTMLElement>("input:not([type=radio]), button")?.focus()
  }, [confirming])

  useEffect(() => {
    if (editing === null) return
    setShown(editing.contact)
    setDraft(editing.contact === null ? emptyDetails : toContactDetails(editing.contact))
    setTags(editing.contact?.tags.join(", ") ?? "")
    setConfirming(false)
    setError(null)
  }, [editing])

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true)
    setError(await action())
    setBusy(false)
  }

  const title = shown === null ? "New contact" : shown.name
  const change = (patch: Partial<ContactDetails>) => setDraft({ ...draft, ...patch })
  const changeChannels = (patch: Partial<ContactDetails["channels"]>) =>
    change({ channels: { ...draft.channels, ...patch } })
  const changeConsent = (patch: Partial<ContactDetails["consent"]>) =>
    change({ consent: { ...draft.consent, ...patch } })
  const companies = contacts.filter((item) => item.kind === "company" && item.id !== shown?.id)

  return (
    <CenterMorphModal open={editing !== null} onOpenChange={(open) => !open && onCancel()}>
      <CenterMorphModalContent
        ariaLabel={title}
        showCloseButton={false}
        dismissible={!busy}
        className="w-full max-w-[520px]"
      >
        <div ref={viewRef}>
          {confirming && shown !== null ? (
            <DeleteConfirm
              name={shown.name}
              description="This removes the contact with its notes and tasks. Its deals stay, without a contact. It cannot be undone."
              error={error}
              busy={busy}
              onCancel={() => setConfirming(false)}
              onConfirm={() => void run(() => onDelete(shown))}
            />
          ) : (
            <div className="flex flex-col gap-4 p-6">
              <h2 className="text-lg font-semibold">{title}</h2>

              {/* The name comes first, so it takes the initial focus. */}
              <Input label="Name" value={draft.name} onChange={(name) => change({ name })} classNames={inputClasses} />

              <fieldset aria-label="Type" className="flex rounded-control bg-muted p-0.5">
                {kinds.map((kind) => (
                  <label
                    key={kind.value}
                    className={`flex-1 cursor-pointer rounded-control-sm px-2 py-1.5 text-center text-[13px] font-medium transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ring ${
                      kind.value === draft.kind ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="contact-kind"
                      checked={kind.value === draft.kind}
                      onChange={() => change({ kind: kind.value })}
                      className="sr-only"
                    />
                    {kind.label}
                  </label>
                ))}
              </fieldset>

              {draft.kind === "person" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className={labelClasses}>Company</span>
                    <select
                      value={draft.companyId ?? ""}
                      onChange={(event) =>
                        change({ companyId: companies.find((item) => item.id === event.target.value)?.id ?? null })
                      }
                      className={selectClasses}
                    >
                      <option value="">No company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Role"
                    value={draft.role}
                    onChange={(role) => change({ role })}
                    classNames={inputClasses}
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Phone"
                  value={draft.channels.phone}
                  onChange={(phone) => changeChannels({ phone })}
                  classNames={inputClasses}
                />
                <Input
                  label="WhatsApp"
                  value={draft.channels.whatsapp}
                  onChange={(whatsapp) => changeChannels({ whatsapp })}
                  classNames={inputClasses}
                />
                <Input
                  label="Telegram"
                  placeholder="@username"
                  value={draft.channels.telegram}
                  onChange={(telegram) => changeChannels({ telegram })}
                  classNames={inputClasses}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className={labelClasses}>Owner</span>
                  <select
                    value={draft.ownerId ?? "you"}
                    onChange={(event) =>
                      change({ ownerId: agents.find((agent) => agent.id === event.target.value)?.id ?? null })
                    }
                    className={selectClasses}
                  >
                    {ownerOptions(agents).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Tags"
                  placeholder="Client, priority"
                  value={tags}
                  onChange={setTags}
                  classNames={inputClasses}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Language"
                  value={draft.language}
                  onChange={(language) => change({ language })}
                  classNames={inputClasses}
                />
                <Input
                  label="Best time"
                  value={draft.bestTime}
                  onChange={(bestTime) => change({ bestTime })}
                  classNames={inputClasses}
                />
                <Input
                  label="Source"
                  value={draft.source}
                  onChange={(source) => change({ source })}
                  classNames={inputClasses}
                />
              </div>

              {draft.kind === "person" && (
                <>
                  <ConsentRow
                    label="Agreed to be messaged first"
                    checked={draft.consent.messages}
                    onChange={(messages) => changeConsent({ messages })}
                  />
                  <ConsentRow
                    label="Agreed to marketing"
                    checked={draft.consent.marketing}
                    onChange={(marketing) => changeConsent({ marketing })}
                  />
                </>
              )}

              {error !== null && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="mt-2 flex items-center gap-2">
                {shown !== null && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    className="text-destructive"
                    onClick={() => {
                      setError(null)
                      setConfirming(true)
                    }}
                  >
                    Delete
                  </Button>
                )}
                <Button variant="outline" disabled={busy} className="ml-auto" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  disabled={busy || draft.name.trim() === ""}
                  onClick={() => void run(() => onSave(toDetails(draft, tags), shown))}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
