import { type Appointment, dayOf } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { useEffect, useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { clockText, longDay } from "./calendarView.ts"
import { errorMessage } from "./hooks.ts"

const reasons = ["The client asked", "The specialist can't", "Booked by mistake", "Other"]

/** Cancels an appointment, or declines one an AI employee asked to book, with a reason for the history. */
export const CancelModal = ({
  appointment,
  onClose,
  onDone
}: {
  /** Empty closes the modal. */
  readonly appointment: Appointment | null
  readonly onClose: () => void
  readonly onDone: (appointment: Appointment) => void
}) => {
  const { settings, specialists } = useCalendar()
  const { contacts, services } = useCrm()
  const [reason, setReason] = useState(reasons[0] ?? "")
  const [other, setOther] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (appointment === null) return
    setReason(reasons[0] ?? "")
    setOther("")
    setError(null)
  }, [appointment])

  if (appointment === null) return null

  const declining = appointment.status === "pending"
  const contact = contacts.find((item) => item.id === appointment.contactId)
  const service = services.find((item) => item.id === appointment.serviceId)
  const specialist = specialists.find((item) => item.id === appointment.specialistId)
  const text = reason === "Other" ? other.trim() : reason

  const cancel = async () => {
    setBusy(true)
    const result = await window.scopeBot.cancelAppointment(appointment.id, text)
    setBusy(false)
    if (result.ok) onDone(result.value)
    else setError(errorMessage(result.error))
  }

  return (
    <CenterMorphModal open onOpenChange={(open) => !open && onClose()}>
      <CenterMorphModalContent
        ariaLabel={declining ? "Decline the booking" : "Cancel the appointment"}
        showCloseButton={false}
        dismissible={!busy}
        className="w-full max-w-[520px]"
      >
        <div className="flex flex-col gap-[18px] p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold tracking-tight">
              {declining ? "Decline" : "Cancel"} {contact === undefined ? "this" : `${contact.name.split(" ")[0]}'s`}{" "}
              appointment?
            </h2>
            <p className="text-sm text-muted-foreground">
              {service?.name ?? "Appointment"} · {longDay(dayOf(new Date(appointment.startsAt), settings.timeZone))},{" "}
              {clockText(appointment.startsAt, settings.timeZone)}–{clockText(appointment.endsAt, settings.timeZone)}
              {specialist === undefined ? "" : ` · ${specialist.name}`}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Why</span>
            <div className="flex flex-wrap gap-1.5">
              {reasons.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setReason(item)}
                  className={`h-8 rounded-control-sm px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    reason === item
                      ? "bg-foreground font-semibold text-background"
                      : "border font-medium hover:bg-muted"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            {reason === "Other" && (
              <input
                value={other}
                onChange={(event) => setOther(event.target.value)}
                placeholder="What happened"
                className="h-10 rounded-control border bg-field px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            The time is free again and its reminders stop. A deal moves on only when every one of its appointments is
            cancelled.
          </p>
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Keep it
            </Button>
            <Button
              disabled={busy || text === ""}
              className="bg-destructive text-white hover:bg-destructive"
              onClick={() => void cancel()}
            >
              {declining ? "Decline" : "Cancel it"}
            </Button>
          </div>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
