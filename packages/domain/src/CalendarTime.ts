/** Dates and times in the calendar's time zone, with nothing but `Intl`. */

const MINUTE_MS = 60 * 1000

const formatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  })

/** The wall clock in a time zone at this moment. */
export const wallClock = (at: Date, timeZone: string) => {
  const parts = formatter(timeZone).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0)
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second")
  }
}

/** How far the zone is ahead of UTC at this moment. */
const offsetMs = (at: Date, timeZone: string) => {
  const clock = wallClock(at, timeZone)
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** Whether `Intl` knows the zone. */
export const isTimeZone = (timeZone: string) => {
  try {
    formatter(timeZone)
    return true
  } catch {
    return false
  }
}

const pad = (value: number) => String(value).padStart(2, "0")

/** The date in the zone, like 2026-11-10. */
export const dayOf = (at: Date, timeZone: string) => {
  const clock = wallClock(at, timeZone)
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`
}

/** Minutes since midnight of a clock time like 09:30. */
export const minutesOf = (time: string) => {
  const [hours = "0", minutes = "0"] = time.split(":")
  return Number(hours) * 60 + Number(minutes)
}

/** The moment a wall clock time on a day happens in the zone. */
export const atZoned = (day: string, minutes: number, timeZone: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number)
  const guess = Date.UTC(year, month - 1, date, 0, minutes)
  // Twice, so a day when the clocks change lands on the right offset.
  const first = guess - offsetMs(new Date(guess), timeZone)
  return new Date(guess - offsetMs(new Date(first), timeZone))
}

/** Monday is 0 and Sunday 6, for a date like 2026-11-10. */
export const weekdayOf = (day: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number)
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7
}

/** The day after, or before with a negative count. */
export const addDays = (day: string, count: number) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, date + count))
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

export const addMinutes = (at: Date, minutes: number) => new Date(at.getTime() + minutes * MINUTE_MS)

/** Like "Tue 10 Nov, 14:00", for activity records and messages. */
export const describeTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .format(new Date(iso))
    .replace(/^(\w+) (\d+ \w+),? /, "$1 $2, ")
