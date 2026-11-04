import type { WorkingHours } from "@scope-bot/domain"

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Whether the agent should answer at this moment, in the business's time zone. */
export const isWithinHours = (hours: WorkingHours, at: Date) => {
  if (!hours.enabled) return true

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: hours.timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(at)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ""

    const time = `${part("hour")}:${part("minute")}`
    return hours.days.includes(weekdays.indexOf(part("weekday"))) && time >= hours.from && time < hours.to
  } catch {
    // An unknown time zone must not silence the agent.
    return true
  }
}
