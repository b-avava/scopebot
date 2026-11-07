const DAY_MS = 24 * 60 * 60 * 1000

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const twoDigits = (value: number) => String(value).padStart(2, "0")

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** A short time for a list: the hour today, then a day, then a date. */
export const messageTime = (iso: string, now: Date) => {
  const date = new Date(iso)
  // Rounded, because a day with a clock change is not 24 hours long.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)

  if (daysAgo <= 0) return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
  if (daysAgo === 1) return "Yesterday"
  if (daysAgo < 7) return weekdays[date.getDay()] ?? ""

  const day = `${twoDigits(date.getDate())}.${twoDigits(date.getMonth() + 1)}`
  return date.getFullYear() === now.getFullYear() ? day : `${day}.${String(date.getFullYear()).slice(2)}`
}
