import {
  type Appointment,
  addDays,
  type ContactId,
  dayOf,
  type Service,
  type ServiceId,
  type Slot,
  type Specialist,
  type SpecialistId
} from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { CenterMorphModal, CenterMorphModalContent } from "@scope-bot/ui/components/motion/center-morph-modal.tsx"
import { X } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useCalendar } from "./CalendarContext.tsx"
import { useCrm } from "./CrmContext.tsx"
import { clockText, dayNumber, lengthMinutes, longDay, monthName, weekdayName } from "./calendarView.ts"
import { errorMessage } from "./hooks.ts"

const labelClasses = "text-xs font-medium text-muted-foreground"
const selectClasses =
  "h-11 w-full rounded-control border bg-field px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
const DAYS = 7

export type Booking =
  | { readonly mode: "new"; readonly day: string; readonly specialistId: SpecialistId | null }
  | { readonly mode: "move"; readonly appointment: Appointment }

const Chip = ({
  active,
  children,
  onSelect
}: {
  readonly active: boolean
  readonly children: ReactNode
  readonly onSelect: () => void
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-control-sm px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      active ? "bg-foreground font-bold text-background" : "border font-medium hover:bg-muted"
    }`}
  >
    {children}
  </button>
)

const ClientAndService = ({
  contactId,
  serviceId,
  services,
  onContact,
  onService
}: {
  readonly contactId: ContactId | null
  readonly serviceId: ServiceId | null
  readonly services: ReadonlyArray<Service>
  readonly onContact: (id: ContactId | null) => void
  readonly onService: (id: ServiceId | null) => void
}) => {
  const { contacts } = useCrm()
  const people = [...contacts].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1.5">
        <span className={labelClasses}>Client</span>
        <select
          value={contactId ?? ""}
          onChange={(event) => onContact(people.find((item) => item.id === event.target.value)?.id ?? null)}
          className={selectClasses}
        >
          <option value="">No client yet</option>
          {people.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelClasses}>Service</span>
        <select
          value={serviceId ?? ""}
          onChange={(event) => onService(services.find((item) => item.id === event.target.value)?.id ?? null)}
          className={selectClasses}
        >
          <option value="">Other, 30 min</option>
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.minutes === undefined ? "" : ` · ${item.minutes} min`}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

const SpecialistChips = ({
  specialists,
  service,
  chosen,
  onChoose
}: {
  readonly specialists: ReadonlyArray<Specialist>
  readonly service: Service | undefined
  readonly chosen: SpecialistId | null
  readonly onChoose: (id: SpecialistId | null) => void
}) => {
  const active = specialists.filter((item) => item.active)
  const able = active.filter((item) => service === undefined || item.serviceIds.includes(service.id))
  const unable = active.filter((item) => !able.includes(item))
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClasses}>Specialist</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={chosen === null} onSelect={() => onChoose(null)}>
          Anyone free
        </Chip>
        {able.map((specialist) => (
          <Chip key={specialist.id} active={chosen === specialist.id} onSelect={() => onChoose(specialist.id)}>
            <span className="size-4 rounded-full" style={{ background: specialist.color }} />
            {specialist.name}
          </Chip>
        ))}
        {unable.length > 0 && service !== undefined && (
          <span className="pl-1.5 text-xs text-muted-foreground">
            {unable.map((item) => item.name).join(" and ")} {unable.length === 1 ? "doesn't" : "don't"} do{" "}
            {service.name.toLowerCase()}
          </span>
        )}
      </div>
    </div>
  )
}

const DayButton = ({
  day,
  count,
  active,
  onSelect
}: {
  readonly day: string
  readonly count: number
  readonly active: boolean
  readonly onSelect: () => void
}) => {
  const box = active ? "bg-foreground text-background" : count === 0 ? "bg-muted/60" : "border hover:bg-muted"
  const tone = active ? "" : count === 0 ? "text-muted-foreground" : "text-[#2E9E5B] dark:text-[#3CBF6E]"
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-control py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${box}`}
    >
      <span className={`text-[11px] ${active ? "" : "text-muted-foreground"}`}>{weekdayName(day)}</span>
      <span className="text-[15px] font-semibold">{dayNumber(day)}</span>
      <span className={`text-[11px] ${tone}`}>{count === 0 ? "Full" : `${count} free`}</span>
    </button>
  )
}

const DayStrip = ({
  first,
  day,
  slots,
  onDay
}: {
  readonly first: string
  readonly day: string
  readonly slots: ReadonlyMap<string, ReadonlyArray<Slot>>
  readonly onDay: (day: string) => void
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center">
      <span className={`flex-1 ${labelClasses}`}>Day</span>
      <span className="text-xs font-semibold">{monthName(day)}</span>
    </div>
    <div className="flex gap-1.5">
      {Array.from({ length: DAYS }, (_, index) => addDays(first, index)).map((item) => (
        <DayButton
          key={item}
          day={item}
          count={(slots.get(item) ?? []).length}
          active={item === day}
          onSelect={() => onDay(item)}
        />
      ))}
    </div>
  </div>
)

const FreeTimes = ({
  day,
  minutes,
  slots,
  specialists,
  chosen,
  timeZone,
  onChoose
}: {
  readonly day: string
  readonly minutes: number | null
  readonly slots: ReadonlyArray<Slot>
  readonly specialists: ReadonlyArray<Specialist>
  readonly chosen: Slot | null
  readonly timeZone: string
  readonly onChoose: (slot: Slot) => void
}) => {
  const rows = specialists
    .map((specialist) => ({ specialist, slots: slots.filter((slot) => slot.specialistId === specialist.id) }))
    .filter((row) => row.slots.length > 0)
  return (
    <div className="flex min-h-[88px] flex-col gap-2.5">
      <span className={labelClasses}>
        Free time on {weekdayName(day)}
        {minutes === null ? "" : ` · ${minutes} min`}
      </span>
      {rows.length === 0 && (
        <span className="text-[13px] text-muted-foreground">No free time this day. Try another one.</span>
      )}
      {rows.map((row) => (
        <div key={row.specialist.id} className="flex items-start gap-1.5">
          <span className="w-[150px] shrink-0 pt-1.5 text-[13px] font-medium">{row.specialist.name}</span>
          <div className="flex flex-wrap gap-1.5">
            {row.slots.map((slot) => (
              <Chip
                key={slot.startsAt}
                active={chosen?.startsAt === slot.startsAt && chosen.specialistId === slot.specialistId}
                onSelect={() => onChoose(slot)}
              >
                {clockText(slot.startsAt, timeZone)}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <span className="text-xs text-muted-foreground">
        Counted from each specialist's hours, breaks and appointments, so two people can't take the same time.
      </span>
    </div>
  )
}

/** Free times of the next week for a service and a specialist, or anyone. */
const useWeekSlots = (
  open: boolean,
  first: string,
  serviceId: ServiceId | null,
  specialistId: SpecialistId | null,
  minutes: number | null
) => {
  const [slots, setSlots] = useState<ReadonlyMap<string, ReadonlyArray<Slot>>>(new Map())
  useEffect(() => {
    if (!open || first === "") return
    let current = true
    const days = Array.from({ length: DAYS }, (_, index) => addDays(first, index))
    void Promise.all(days.map((day) => window.scopeBot.findSlots({ serviceId, specialistId, day, minutes }))).then(
      (results) => {
        if (!current) return
        setSlots(new Map(days.map((day, index) => [day, results[index]?.ok ? results[index].value : []])))
      }
    )
    return () => {
      current = false
    }
  }, [open, first, serviceId, specialistId, minutes])
  return slots
}

const Summary = ({
  chosen,
  specialist,
  day,
  timeZone
}: {
  readonly chosen: Slot | null
  readonly specialist: Specialist | undefined
  readonly day: string
  readonly timeZone: string
}) => (
  <span className="flex-1 text-[13px] text-muted-foreground">
    {chosen === null || specialist === undefined ? (
      "Pick a free time"
    ) : (
      <>
        {longDay(day)},{" "}
        <b className="text-foreground">
          {clockText(chosen.startsAt, timeZone)}–{clockText(chosen.endsAt, timeZone)}
        </b>{" "}
        with {specialist.name}
      </>
    )}
  </span>
)

/** Booking a new appointment, or moving one: who, what, which day, and a time that is free. */
export const BookingModal = ({
  booking,
  onClose,
  onDone
}: {
  /** Empty closes the modal. */
  readonly booking: Booking | null
  readonly onClose: () => void
  readonly onDone: (appointment: Appointment) => void
}) => {
  const { settings, specialists } = useCalendar()
  const { contacts, services } = useCrm()
  const moving = booking?.mode === "move" ? booking.appointment : null
  const [contactId, setContactId] = useState<ContactId | null>(null)
  const [serviceId, setServiceId] = useState<ServiceId | null>(null)
  const [specialistId, setSpecialistId] = useState<SpecialistId | null>(null)
  const [first, setFirst] = useState("")
  const [day, setDay] = useState("")
  const [chosen, setChosen] = useState<Slot | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bookable = useMemo(() => services.filter((service) => service.active), [services])

  useEffect(() => {
    if (booking === null) return
    const isNew = booking.mode === "new"
    const start = isNew ? booking.day : dayOf(new Date(booking.appointment.startsAt), settings.timeZone)
    setFirst(start)
    setDay(start)
    setChosen(null)
    setError(null)
    setNote("")
    setContactId(isNew ? null : booking.appointment.contactId)
    const offered = bookable.find((item) => specialists.some((one) => one.active && one.serviceIds.includes(item.id)))
    setServiceId(isNew ? ((offered ?? bookable[0])?.id ?? null) : booking.appointment.serviceId)
    setSpecialistId(isNew ? booking.specialistId : null)
  }, [booking, bookable, specialists, settings.timeZone])

  const service = services.find((item) => item.id === serviceId)
  const minutes = moving === null ? (service?.minutes ?? null) : lengthMinutes(moving)
  const slots = useWeekSlots(booking !== null, first, serviceId, specialistId, minutes)
  const daySlots = (slots.get(day) ?? []).filter((slot) => slot.startsAt !== moving?.startsAt)

  const save = async () => {
    if (chosen === null || booking === null) return
    setBusy(true)
    const result =
      booking.mode === "move"
        ? await window.scopeBot.moveAppointment(booking.appointment.id, {
            specialistId: chosen.specialistId,
            startsAt: chosen.startsAt
          })
        : await window.scopeBot.bookAppointment({
            specialistId: chosen.specialistId,
            serviceId,
            contactId,
            dealId: null,
            startsAt: chosen.startsAt,
            minutes,
            note: note.trim()
          })
    setBusy(false)
    if (result.ok) onDone(result.value)
    else setError(errorMessage(result.error))
  }

  return (
    <CenterMorphModal open={booking !== null} onOpenChange={(open) => !open && onClose()}>
      <CenterMorphModalContent
        ariaLabel={moving === null ? "New appointment" : "Move appointment"}
        showCloseButton={false}
        dismissible={!busy}
        className="w-full max-w-[640px]"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-xl font-bold tracking-tight">
              {moving === null ? "New appointment" : "Move appointment"}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </div>

          {moving === null ? (
            <ClientAndService
              contactId={contactId}
              serviceId={serviceId}
              services={bookable}
              onContact={setContactId}
              onService={(id) => {
                setServiceId(id)
                setChosen(null)
              }}
            />
          ) : (
            <div className="flex flex-col gap-0.5 rounded-card bg-field px-3.5 py-3">
              <span className="text-sm font-semibold">
                {contacts.find((item) => item.id === moving.contactId)?.name ?? "No client"} ·{" "}
                {service?.name ?? "Appointment"}, {lengthMinutes(moving)} min
              </span>
              <span className="text-xs text-muted-foreground">
                Now: {longDay(dayOf(new Date(moving.startsAt), settings.timeZone))},{" "}
                {clockText(moving.startsAt, settings.timeZone)}
              </span>
            </div>
          )}

          <SpecialistChips
            specialists={specialists}
            service={service}
            chosen={specialistId}
            onChoose={(id) => {
              setSpecialistId(id)
              setChosen(null)
            }}
          />
          <DayStrip
            first={first}
            day={day}
            slots={slots}
            onDay={(next) => {
              setDay(next)
              setChosen(null)
            }}
          />
          <FreeTimes
            day={day}
            minutes={minutes}
            slots={daySlots}
            specialists={specialists}
            chosen={chosen}
            timeZone={settings.timeZone}
            onChoose={setChosen}
          />

          {moving === null && (
            <label className="flex flex-col gap-1.5">
              <span className={labelClasses}>Note for the specialist</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="h-10 rounded-control border bg-field px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Summary
              chosen={chosen}
              specialist={specialists.find((item) => item.id === chosen?.specialistId)}
              day={day}
              timeZone={settings.timeZone}
            />
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy || chosen === null} onClick={() => void save()}>
              {moving === null ? "Book" : "Move"}
            </Button>
          </div>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  )
}
