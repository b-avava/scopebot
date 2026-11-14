import type { Appointment } from "@scope-bot/domain"

/** What changed on a card's day since the answer looked at it (ADR 0024). */
export interface CardChanges {
  /** On the day now, but the answer did not see them. */
  readonly added: ReadonlySet<string>
  /** The answer saw them, and they are not on the day any more. */
  readonly gone: ReadonlyArray<string>
}

/** A card from before cards remembered what they saw shows no changes. */
export const cardChanges = (now: ReadonlyArray<Appointment>, seen: ReadonlyArray<string> | undefined): CardChanges => {
  if (seen === undefined) return { added: new Set(), gone: [] }
  const there = new Set<string>(now.map((item) => item.id))
  const saw = new Set<string>(seen)
  return {
    added: new Set(now.filter((item) => !saw.has(item.id)).map((item) => item.id)),
    gone: seen.filter((id) => !there.has(id))
  }
}

export const changesText = (changes: CardChanges) => {
  const count = changes.added.size + changes.gone.length
  return count === 0 ? null : `${count} ${count === 1 ? "change" : "changes"} since the answer`
}
