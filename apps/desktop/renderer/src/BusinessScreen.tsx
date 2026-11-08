import { type BusinessProfile, emptyBusinessProfile } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { useEffect, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { errorMessage } from "./hooks.ts"
import { TitleBar } from "./TitleBar.tsx"

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground" }

export const BusinessScreen = () => {
  const { reload } = useCrm()
  const [saved, setSaved] = useState<BusinessProfile>(emptyBusinessProfile)
  const [draft, setDraft] = useState<BusinessProfile>(emptyBusinessProfile)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void window.scopeBot.getBusiness().then((result) => {
      if (result.ok) {
        setSaved(result.value)
        setDraft(result.value)
      } else {
        setStatus(errorMessage(result.error))
      }
    })
  }, [])

  const change = (patch: Partial<BusinessProfile>) => {
    setDraft({ ...draft, ...patch })
    setStatus(null)
  }

  const save = async () => {
    const result = await window.scopeBot.saveBusiness(draft)
    if (result.ok) {
      setSaved(result.value)
      setStatus("Saved")
      // Deals and services show the currency set here.
      void reload()
    } else {
      setStatus(errorMessage(result.error))
    }
  }

  return (
    <>
      <TitleBar>
        <span className="text-sm font-semibold">Business</span>
      </TitleBar>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-6 py-7">
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              All your employees use these facts when they talk to customers. Whatever is not here, they will not
              invent.
            </p>

            <Input label="Name" value={draft.name} onChange={(name) => change({ name })} classNames={inputClasses} />
            <Input
              label="Address"
              value={draft.address}
              onChange={(address) => change({ address })}
              classNames={inputClasses}
            />
            <Input
              label="Phone"
              value={draft.phone}
              onChange={(phone) => change({ phone })}
              classNames={inputClasses}
            />
            <Input
              label="Opening hours"
              placeholder="Mon-Sat 9:00-18:00"
              value={draft.openingHours}
              onChange={(openingHours) => change({ openingHours })}
              classNames={inputClasses}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted-foreground">About</span>
              <textarea
                rows={3}
                value={draft.about}
                onChange={(event) => change({ about: event.target.value })}
                placeholder="Who you are, parking, how to get ready…"
                className="resize-none rounded-control border bg-field px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <Input
              label="Currency"
              placeholder="GEL"
              value={draft.currency}
              onChange={(currency) => change({ currency })}
              classNames={inputClasses}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t px-6 py-3">
          <Button size="sm" disabled={JSON.stringify(draft) === JSON.stringify(saved)} onClick={() => void save()}>
            Save
          </Button>
          {status !== null && (
            <span role="status" className="text-[13px] text-muted-foreground">
              {status}
            </span>
          )}
        </div>
      </div>
    </>
  )
}
