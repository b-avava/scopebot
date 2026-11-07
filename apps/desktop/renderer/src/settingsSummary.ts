import type { ActionPolicy, AgentPermissions, AgentSettings } from "@scope-bot/domain"

const dayNames: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" }

// Monday first, so a working week reads as one range.
const weekOrder = [1, 2, 3, 4, 5, 6, 0]

const policyRank: Record<ActionPolicy, number> = { deny: 0, approve: 1, auto: 2 }

/** Whether a change gives the employee more freedom than it had. */
export const widensPolicy = (from: ActionPolicy, to: ActionPolicy) => policyRank[to] > policyRank[from]

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

export const permissionsSummary = (permissions: AgentPermissions) => {
  const policies = Object.values(permissions)
  const count = (policy: ActionPolicy) => policies.filter((item) => item === policy).length
  return `Alone: ${count("auto")} · Asks: ${count("approve")} · Never: ${count("deny")}`
}

export const limitsSummary = ({ limits }: Pick<AgentSettings, "limits">) =>
  `${limits.maxMessagesPerDay === 1 ? "1 reply" : `${limits.maxMessagesPerDay} replies`} · ${limits.maxDiscountPercent === 0 ? "no discounts" : `up to ${limits.maxDiscountPercent}%`}`

const daysSummary = (days: ReadonlyArray<number>) => {
  const ordered = weekOrder.filter((day) => days.includes(day))
  const first = ordered[0]
  const last = ordered.at(-1)
  if (first === undefined || last === undefined) return "No days"
  const isRange = weekOrder.indexOf(last) - weekOrder.indexOf(first) === ordered.length - 1
  if (ordered.length > 2 && isRange) return `${dayNames[first]}–${dayNames[last]}`
  return ordered.map((day) => dayNames[day]).join(", ")
}

export const hoursSummary = ({ hours }: Pick<AgentSettings, "hours">) =>
  hours.enabled ? `${daysSummary(hours.days)}, ${hours.from}–${hours.to}` : "Around the clock"

export const escalationSummary = ({ escalation }: Pick<AgentSettings, "escalation">) => {
  const cases = Object.values(escalation).filter(Boolean).length
  return cases === 0 ? "Never" : plural(cases, "case")
}

export const backupsSummary = ({ backupModels }: Pick<AgentSettings, "backupModels">) =>
  backupModels.length === 0 ? "None" : plural(backupModels.length, "model")
