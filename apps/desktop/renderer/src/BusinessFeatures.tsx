import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CalendarDays, Info } from "lucide-react"
import { useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { errorMessage } from "./hooks.ts"

/** Modules a business turns on only when it needs them. Turning one off hides it and keeps its data. */
export const BusinessFeatures = ({ businessName }: { readonly businessName: string }) => {
  const { settings, saveSettings } = useCalendar()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const on = settings.enabled

  const toggle = async () => {
    setBusy(true)
    const result = await saveSettings({ ...settings, enabled: !on })
    setBusy(false)
    setError(result.ok ? null : errorMessage(result.error))
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-6 pt-10 pb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Features</h1>
          <p className="text-sm text-muted-foreground">
            Turn on only what {businessName === "" ? "your business" : businessName} needs. Everything else stays out of
            the way.
          </p>
        </div>
        <section className="flex flex-col gap-[18px] rounded-panel border bg-field px-6 py-[22px]">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-muted">
              <CalendarDays className="size-6" />
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold">Calendar and appointments</h2>
                <span
                  className={`flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold ${
                    on ? "bg-[#3CBF6E]/15 text-[#2E9E5B] dark:text-[#3CBF6E]" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {on ? "On" : "Off"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                For businesses that work by appointment: clinics, salons, repair shops, tutors, consultants.
              </p>
            </div>
            <Button variant={on ? "outline" : "primary"} disabled={busy} onClick={() => void toggle()}>
              {on ? "Turn off" : "Turn on"}
            </Button>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5 rounded-card bg-background px-4 py-3.5">
              <span className="text-[13px] font-semibold">What appears</span>
              <span className="text-[13px] leading-5 text-muted-foreground">
                Calendar in the sidebar, hours for each specialist, service lengths, appointments on deals and clients.
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 rounded-card bg-background px-4 py-3.5">
              <span className="text-[13px] font-semibold">What AI employees get</span>
              <span className="text-[13px] leading-5 text-muted-foreground">
                They can offer free times and book, within the permissions in their settings.
              </span>
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            You can turn it off later. Appointments and schedules are kept, just hidden, and AI employees stop booking.
          </p>
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
