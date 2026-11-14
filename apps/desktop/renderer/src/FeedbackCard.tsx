import {
  type Agent,
  type ChatMessage,
  type FeedbackReason,
  MAX_FEEDBACK_NOTE,
  MAX_RULE_LENGTH,
  type MessageFeedback
} from "@scope-bot/domain"
import { ThinkingShimmer } from "@scope-bot/ui/components/agents/loading-states/thinking-shimmer.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { Check, CircleDashed, X } from "lucide-react"
import { useState } from "react"

// The card opens under an answer that may sit at the bottom of the screen.
const bringIntoView = (element: HTMLElement | null) => {
  void element?.scrollIntoView({ block: "nearest", behavior: "smooth" })
}

import { errorMessage } from "./hooks.ts"

const reasons: ReadonlyArray<{ readonly value: FeedbackReason; readonly label: string }> = [
  { value: "wrong-facts", label: "Wrong facts" },
  { value: "too-long", label: "Too long" },
  { value: "wrong-tone", label: "Wrong tone" },
  { value: "should-ask-person", label: "Should have asked a person" }
]

const chipClasses = (selected: boolean) =>
  `rounded-control-sm border px-2.5 py-1 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
    selected ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
  }`

const fieldClasses =
  "w-full resize-none rounded-control border bg-field px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

type Outcome = { readonly kind: "feedback" } | { readonly kind: "rule"; readonly text: string; readonly waits: boolean }

interface FeedbackCardProps {
  readonly agent: Agent
  readonly conversationId: string
  readonly answer: ChatMessage
  /** Owners and admins save a rule at once; a member's waits for one of them. */
  readonly canManageRules: boolean
  readonly onSaved: (feedback: MessageFeedback) => void
  readonly onClose: () => void
}

const Done = ({
  agent,
  outcome,
  onClose
}: {
  readonly agent: Agent
  readonly outcome: Outcome
  readonly onClose: () => void
}) => (
  <div role="status" className="flex items-center gap-2.5 rounded-card border px-3 py-2.5 text-[13px]">
    {outcome.kind === "rule" && outcome.waits ? (
      <CircleDashed className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
    ) : (
      <Check className="size-4 shrink-0 text-emerald-500" strokeWidth={2.5} />
    )}
    <span className="min-w-0 flex-1">
      {outcome.kind === "feedback"
        ? `Thanks. It goes into ${agent.name}'s feedback.`
        : outcome.waits
          ? `Rule sent to an owner or admin. ${agent.name} follows it once they agree.`
          : `New rule for ${agent.name}: ${outcome.text}`}
    </span>
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="size-3.5" />
    </button>
  </div>
)

/** What the employee should do differently, and maybe a rule so it always does (ADR 0023). */
export const FeedbackCard = ({
  agent,
  conversationId,
  answer,
  canManageRules,
  onSaved,
  onClose
}: FeedbackCardProps) => {
  const [chosen, setChosen] = useState<ReadonlyArray<FeedbackReason>>([])
  const [note, setNote] = useState("")
  const [rule, setRule] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (outcome !== null) return <Done agent={agent} outcome={outcome} onClose={onClose} />

  const toggleReason = (reason: FeedbackReason) =>
    setChosen(chosen.includes(reason) ? chosen.filter((item) => item !== reason) : [...chosen, reason])

  const toggleRule = async (on: boolean) => {
    if (!on) return setRule(null)
    setError(null)
    setDrafting(true)
    const drafted = await window.scopeBot.draftRule(agent.id, { note: note.trim(), messageId: answer.id })
    setDrafting(false)
    // Without a model the person writes the rule themselves.
    setRule(drafted.ok ? drafted.value.text : note.trim().slice(0, MAX_RULE_LENGTH))
  }

  const send = async (withRule: boolean) => {
    setError(null)
    setSaving(true)
    const saved = await window.scopeBot.giveFeedback(agent.id, conversationId, answer.id, {
      rating: "bad",
      reasons: chosen,
      note: note.trim()
    })
    if (!saved.ok) {
      setSaving(false)
      return setError(errorMessage(saved.error))
    }
    onSaved(saved.value)
    const text = rule?.trim() ?? ""
    if (!withRule || text === "") return setOutcome({ kind: "feedback" })
    const added = await window.scopeBot.addRule(agent.id, { text, sourceMessageId: answer.id })
    setSaving(false)
    if (!added.ok) return setError(errorMessage(added.error))
    setOutcome({ kind: "rule", text: added.value.text, waits: added.value.status === "suggested" })
  }

  const ruleLabel = canManageRules ? `Add it to ${agent.name}'s rules` : `Suggest it as a rule for ${agent.name}`

  return (
    <section
      ref={bringIntoView}
      aria-label="Feedback"
      className="flex w-full max-w-[760px] flex-col gap-3 rounded-[16px] border bg-background p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">What should {agent.name} do differently?</h3>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {reasons.map((reason) => (
          <button
            key={reason.value}
            type="button"
            aria-pressed={chosen.includes(reason.value)}
            onClick={() => toggleReason(reason.value)}
            className={chipClasses(chosen.includes(reason.value))}
          >
            {reason.label}
          </button>
        ))}
      </div>

      <textarea
        aria-label="What was wrong"
        rows={2}
        maxLength={MAX_FEEDBACK_NOTE}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="What was wrong, in a few words"
        className={fieldClasses}
      />

      <div className="flex items-start gap-3 rounded-control border px-3 py-2.5">
        <Switch
          ariaLabel={ruleLabel}
          checked={rule !== null || drafting}
          disabled={note.trim() === "" || drafting}
          onCheckedChange={(on) => void toggleRule(on)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">{ruleLabel}</span>
          {drafting && (
            <ThinkingShimmer className="text-[13px]">{`${agent.name} is writing the rule…`}</ThinkingShimmer>
          )}
          {rule !== null && (
            <textarea
              aria-label="Rule"
              rows={2}
              maxLength={MAX_RULE_LENGTH}
              value={rule}
              onChange={(event) => setRule(event.target.value)}
              className={fieldClasses}
            />
          )}
          <span className="text-xs text-muted-foreground">
            {note.trim() === ""
              ? "Write what was wrong first, and the employee drafts the rule from it."
              : canManageRules
                ? `${agent.name} follows its rules in every chat. You can change them in its settings.`
                : "You can change the wording. An owner or admin decides."}
          </span>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {rule === null ? (
          <Button size="sm" disabled={saving} onClick={() => void send(false)}>
            Send feedback
          </Button>
        ) : (
          <>
            <Button size="sm" disabled={saving || rule.trim() === ""} onClick={() => void send(true)}>
              {canManageRules ? "Save the rule" : "Send for approval"}
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => void send(false)}>
              Only send feedback
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
