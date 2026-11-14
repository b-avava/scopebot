import { type Agent, type AgentRule, MAX_ACTIVE_RULES, MAX_RULE_LENGTH, type RulePatch } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { CircleDashed, Pencil, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { errorMessage } from "./hooks.ts"

const hintClasses = "text-[13px] leading-[18px] text-muted-foreground"
const textAreaClasses =
  "w-full resize-none rounded-control border bg-field px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
const iconButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** A team's rules for one employee, kept fresh after each change. */
export const useRules = (agentId: string) => {
  const [rules, setRules] = useState<ReadonlyArray<AgentRule>>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const result = await window.scopeBot.listRules(agentId)
    if (result.ok) setRules(result.value)
    else setError(errorMessage(result.error))
  }, [agentId])

  useEffect(() => {
    void reload()
  }, [reload])

  /** Runs a change and reloads. True when it worked. */
  const run = async (
    change: Promise<{ readonly ok: boolean; readonly error?: Parameters<typeof errorMessage>[0] }>
  ) => {
    setError(null)
    const result = await change
    if (!result.ok && result.error !== undefined) setError(errorMessage(result.error))
    await reload()
    return result.ok
  }

  const active = rules.filter((rule) => rule.status === "active")
  return {
    rules,
    active,
    suggested: rules.filter((rule) => rule.status === "suggested"),
    following: active.filter((rule) => rule.enabled).length,
    error,
    add: (text: string) => run(window.scopeBot.addRule(agentId, { text })),
    change: (rule: AgentRule, patch: RulePatch) => run(window.scopeBot.changeRule(agentId, rule.id, patch)),
    decide: (rule: AgentRule, accept: boolean) => run(window.scopeBot.decideRule(agentId, rule.id, accept)),
    remove: (rule: AgentRule) => run(window.scopeBot.removeRule(agentId, rule.id))
  }
}

export type Rules = ReturnType<typeof useRules>

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

const whoAdded = (rule: AgentRule) =>
  [
    rule.suggestedBy === null ? null : `Suggested by ${rule.suggestedBy.name}`,
    rule.decidedBy === null ? null : `${rule.suggestedBy === null ? "Added" : "added"} by ${rule.decidedBy.name}`,
    shortDate(rule.decidedAt ?? rule.createdAt),
    rule.sourceMessageId === null ? "typed here" : "from an answer"
  ]
    .filter((part) => part !== null)
    .join(" · ")

const RuleEditor = ({
  initial,
  label,
  onCancel,
  onSave
}: {
  readonly initial: string
  readonly label: string
  readonly onCancel: () => void
  readonly onSave: (text: string) => void
}) => {
  const [text, setText] = useState(initial)
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Rule"
        // biome-ignore lint/a11y/noAutofocus: the person just asked to write a rule
        autoFocus
        rows={3}
        maxLength={MAX_RULE_LENGTH}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="For example: when you answer about the schedule, say the specialist's name first."
        className={textAreaClasses}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={text.trim() === ""} onClick={() => onSave(text.trim())}>
          {label}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

const ActiveRule = ({
  rule,
  rules,
  canManage
}: {
  readonly rule: AgentRule
  readonly rules: Rules
  readonly canManage: boolean
}) => {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <li className="px-3 py-3">
        <RuleEditor
          initial={rule.text}
          label="Save"
          onCancel={() => setEditing(false)}
          onSave={(text) => void rules.change(rule, { text }).then((ok) => setEditing(!ok))}
        />
      </li>
    )
  }
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <span className="pt-0.5">
        <Switch
          ariaLabel={rule.enabled ? "Turn the rule off" : "Turn the rule on"}
          checked={rule.enabled}
          disabled={!canManage}
          onCheckedChange={(enabled) => void rules.change(rule, { enabled })}
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-sm ${rule.enabled ? "" : "text-muted-foreground"}`}>{rule.text}</span>
        <span className="text-xs text-muted-foreground">{whoAdded(rule)}</span>
      </span>
      {canManage && (
        <span className="flex">
          <button type="button" aria-label="Change the rule" onClick={() => setEditing(true)} className={iconButton}>
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Delete the rule"
            onClick={() => void rules.remove(rule)}
            className={iconButton}
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      )}
    </li>
  )
}

const SuggestedRule = ({
  rule,
  rules,
  canManage
}: {
  readonly rule: AgentRule
  readonly rules: Rules
  readonly canManage: boolean
}) => (
  <li className="flex flex-col gap-2 rounded-card border border-dashed border-amber-400 bg-amber-400/5 px-3 py-3">
    <span className="flex items-start gap-2.5">
      <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{rule.text}</span>
        <span className="text-xs text-muted-foreground">
          Suggested by {rule.suggestedBy?.name ?? "a colleague"} · {shortDate(rule.createdAt)} · waits for an owner or
          admin
        </span>
      </span>
    </span>
    {canManage && (
      <span className="flex gap-2 pl-6">
        <Button size="sm" onClick={() => void rules.decide(rule, true)}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void rules.decide(rule, false)}>
          Decline
        </Button>
      </span>
    )}
  </li>
)

/** The rules the team taught the employee, under its settings (ADR 0023). */
export const RulesPage = ({
  agent,
  rules,
  canManage
}: {
  readonly agent: Pick<Agent, "name">
  readonly rules: Rules
  readonly canManage: boolean
}) => {
  const [adding, setAdding] = useState(false)
  return (
    <>
      <p className={hintClasses}>
        {agent.name} follows them in every chat, after the instructions. They never change what it is allowed to do.{" "}
        {rules.following} of {MAX_ACTIVE_RULES}.
      </p>

      {rules.error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {rules.error}
        </p>
      )}

      {rules.suggested.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rules.suggested.map((rule) => (
            <SuggestedRule key={rule.id} rule={rule} rules={rules} canManage={canManage} />
          ))}
        </ul>
      )}

      {rules.active.length > 0 && (
        <ul className="flex flex-col divide-y rounded-card border">
          {rules.active.map((rule) => (
            <ActiveRule key={rule.id} rule={rule} rules={rules} canManage={canManage} />
          ))}
        </ul>
      )}

      {rules.active.length === 0 && rules.suggested.length === 0 && !adding && (
        <p className={hintClasses}>
          No rules yet. Add one here, or turn a note on an answer into a rule with the thumbs down under it.
        </p>
      )}

      {adding ? (
        <RuleEditor
          initial=""
          label={canManage ? "Add the rule" : "Send for approval"}
          onCancel={() => setAdding(false)}
          onSave={(text) => void rules.add(text).then((ok) => setAdding(!ok))}
        />
      ) : (
        <div>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            {canManage ? "Add a rule" : "Suggest a rule"}
          </Button>
        </div>
      )}
    </>
  )
}
