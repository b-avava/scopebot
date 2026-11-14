import { type Appointment, addDays, atZoned, dayOf, type Specialist, wallClock, weekdayOf } from "@scope-bot/domain"

/** One pixel per minute keeps every position simple. */
export const PX_PER_MINUTE = 1

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const longWeekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
]

export const weekdayName = (day: string) => weekdayNames[weekdayOf(day)] ?? ""

export const dayNumber = (day: string) => Number(day.slice(8, 10))

export const monthName = (day: string) => monthNames[Number(day.slice(5, 7)) - 1] ?? ""

/** "Tuesday, 10 November". */
export const longDay = (day: string) => `${longWeekdayNames[weekdayOf(day)] ?? ""}, ${dayNumber(day)} ${monthName(day)}`

/** "10 Nov". */
export const shortDay = (day: string) => `${dayNumber(day)} ${monthName(day).slice(0, 3)}`

/** The Monday of the week a day is in. */
export const weekStart = (day: string) => addDays(day, -weekdayOf(day))

/** Minutes since midnight of an ISO time, on the wall clock of the zone. */
export const clockMinutes = (iso: string, timeZone: string) => {
  const clock = wallClock(new Date(iso), timeZone)
  return clock.hour * 60 + clock.minute
}

/** "14:00". */
export const clockText = (iso: string, timeZone: string) => {
  const minutes = clockMinutes(iso, timeZone)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

export const minutesText = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

export const lengthMinutes = (appointment: Appointment) =>
  Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60000)

/** The start and end of a day in the zone, ISO, for asking the server. */
export const dayRange = (day: string, days: number, timeZone: string) => ({
  from: atZoned(day, 0, timeZone).toISOString(),
  to: atZoned(addDays(day, days), 0, timeZone).toISOString()
})

export const today = (timeZone: string) => dayOf(new Date(), timeZone)

const toMinutes = (time: string) => {
  const [hours = "0", minutes = "0"] = time.split(":")
  return Number(hours) * 60 + Number(minutes)
}

/** The hours the grid shows: from the earliest opening to the latest closing of anyone shown. */
export const gridHours = (specialists: ReadonlyArray<Specialist>) => {
  const open = specialists.flatMap((item) => item.hours.filter((day) => day.open))
  if (open.length === 0) return { from: 9 * 60, to: 19 * 60 }
  const from = Math.min(...open.map((day) => toMinutes(day.from)))
  const to = Math.max(...open.map((day) => toMinutes(day.to)))
  return { from: Math.floor(from / 60) * 60, to: Math.min(24 * 60, Math.ceil(to / 60) * 60 + 60) }
}

export { toMinutes }

/** Whether the time is still kept: a hold stops once it runs out. */
export const isLive = (appointment: Appointment, now: number) =>
  appointment.status !== "held" || appointment.holdExpiresAt === null || Date.parse(appointment.holdExpiresAt) > now

export type CardLook = "done" | "now" | "confirmed" | "booked" | "waiting" | "held" | "no-show" | "cancelled"

/** How an appointment looks at this moment. */
export const lookOf = (appointment: Appointment, now: number): CardLook => {
  if (appointment.status === "arrived") return "done"
  if (appointment.status === "no-show") return "no-show"
  if (appointment.status === "cancelled") return "cancelled"
  if (appointment.status === "pending") return "waiting"
  if (appointment.status === "held") return "held"
  if (Date.parse(appointment.startsAt) <= now && now < Date.parse(appointment.endsAt)) return "now"
  return appointment.status === "confirmed" ? "confirmed" : "booked"
}

export const lookLabel: Record<CardLook, string> = {
  done: "Came",
  now: "In progress",
  confirmed: "Confirmed",
  booked: "Not confirmed",
  waiting: "Waits for your OK",
  held: "Held for a chat",
  "no-show": "Didn't come",
  cancelled: "Cancelled"
}

/** The colour of the bar and label of each look. */
export const lookTone: Record<CardLook, string> = {
  done: "text-muted-foreground",
  now: "text-[#2E9E5B] dark:text-[#3CBF6E]",
  confirmed: "text-[#2E9E5B] dark:text-[#3CBF6E]",
  booked: "text-muted-foreground",
  waiting: "text-amber-600 dark:text-amber-400",
  held: "text-amber-600 dark:text-amber-400",
  "no-show": "text-red-600 dark:text-[#FF6B6B]",
  cancelled: "text-muted-foreground"
}

export const lookBar: Record<CardLook, string | null> = {
  done: null,
  now: "bg-[#3CBF6E]",
  confirmed: "bg-[#3CBF6E]",
  booked: "bg-muted-foreground/70",
  waiting: null,
  held: null,
  "no-show": "bg-[#E5484D]",
  cancelled: null
}

export const lookCard: Record<CardLook, string> = {
  done: "bg-muted/60",
  now: "bg-muted",
  confirmed: "bg-muted",
  booked: "bg-muted",
  waiting: "border border-dashed border-amber-400 bg-amber-400/10",
  held: "border border-dashed border-amber-400",
  "no-show": "bg-[#E5484D]/10",
  cancelled: "border"
}

/** Colours a new specialist can take, from the app's palette. */
export const specialistColors = ["#2F9BCB", "#8E6AD8", "#E07B39", "#3CBF6E", "#E5484D", "#F2B01E"]

/** "TB" for Tamar Beridze. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => part !== "" && !part.endsWith("."))
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
