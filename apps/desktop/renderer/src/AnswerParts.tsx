import type { Agent, ChatMessage, FeedbackRating } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert
} from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { type AnswerSteps, durationLabel } from "./chatThread.ts"

const COPIED_MS = 1600

const iconButton =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"

const steps = (count: number) => (count === 1 ? "1 step" : `${count} steps`)

/** The line under the employee's name: what it did for this answer, opened on a click. */
export const StepsLine = ({ answer }: { readonly answer: AnswerSteps }) => {
  const [open, setOpen] = useState(false)
  const failed = answer.steps.filter((step) => step.status === "failed").length
  const first = answer.steps[0]
  const title = first?.summary ?? "Why this answer"
  const details = [
    answer.steps.length > 0 ? steps(answer.steps.length) : null,
    failed > 0 ? `${failed} didn't work` : null,
    answer.steps.length > 0 ? durationLabel(answer.durationMs) : null
  ].filter((part) => part !== null)

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-7 max-w-full items-center gap-2 rounded-control-sm border px-2.5 text-xs outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {failed > 0 ? (
          <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <Check className="size-3.5 shrink-0 text-emerald-500" strokeWidth={2.5} />
        )}
        <span className="truncate font-medium">{title}</span>
        {details.length > 0 && <span className="shrink-0 text-muted-foreground">{details.join(" · ")}</span>}
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ol className="flex w-full max-w-[720px] flex-col gap-2.5 rounded-card border px-3 py-2.5 text-[13px]">
          {answer.steps.map((step) => (
            <li key={step.id} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0">
                {step.status === "failed" ? (
                  <TriangleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span>{step.summary}</span>
                {step.reason !== undefined && <span className="text-muted-foreground">Why: {step.reason}</span>}
              </span>
            </li>
          ))}
          {answer.reason !== null && (
            <li className="flex gap-2.5">
              <span className="mt-0.5 shrink-0">
                <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span>Answered</span>
                <span className="text-muted-foreground">Why: {answer.reason}</span>
              </span>
            </li>
          )}
        </ol>
      )}
    </div>
  )
}

/** "‹ 2 / 3 ›" for a message with versions. */
export const VersionSwitcher = ({
  versions,
  shown,
  onShow
}: {
  readonly versions: ReadonlyArray<ChatMessage>
  readonly shown: ChatMessage
  readonly onShow: (message: ChatMessage) => void
}) => {
  const index = versions.findIndex((item) => item.id === shown.id)
  const go = (step: number) => {
    const next = versions[index + step]
    if (next !== undefined) onShow(next)
  }
  return (
    <span className="flex items-center text-xs text-muted-foreground">
      <button
        type="button"
        aria-label="Previous version"
        disabled={index <= 0}
        onClick={() => go(-1)}
        className={iconButton}
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="min-w-8 text-center font-medium tabular-nums text-foreground">
        {index + 1} / {versions.length}
      </span>
      <button
        type="button"
        aria-label="Next version"
        disabled={index >= versions.length - 1}
        onClick={() => go(1)}
        className={iconButton}
      >
        <ChevronRight className="size-3.5" />
      </button>
    </span>
  )
}

const useCopied = () => {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => setCopied(true))
  }
  return { copied, copy }
}

export const CopyButton = ({ text }: { readonly text: string }) => {
  const { copied, copy } = useCopied()
  return copied ? (
    <span role="status" className="flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium">
      <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
      Copied
    </span>
  ) : (
    <button type="button" aria-label="Copy" title="Copy" onClick={() => copy(text)} className={iconButton}>
      <Copy className="size-3.5" />
    </button>
  )
}

/** Copy, answer again, 👍 and 👎. Always under the last answer, on hover under the others. */
export const AnswerActions = ({
  answer,
  rating,
  last,
  pinned,
  busy,
  versions,
  onAnswerAgain,
  onRate,
  children
}: {
  readonly answer: ChatMessage
  readonly rating: FeedbackRating | null
  /** Only the last answer can be given again. */
  readonly last: boolean
  /** Shown without hovering: the last answer, or one with versions. */
  readonly pinned: boolean
  readonly busy: boolean
  readonly versions: ReactNode
  readonly onAnswerAgain: () => void
  readonly onRate: (rating: FeedbackRating) => void
  readonly children?: ReactNode
}) => (
  <div
    className={`flex items-center gap-0.5 transition-opacity duration-150 ${
      pinned || rating !== null ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
    }`}
  >
    <CopyButton text={answer.text} />
    {last && (
      <button
        type="button"
        aria-label="Answer again"
        title="Answer again"
        disabled={busy}
        onClick={onAnswerAgain}
        className={iconButton}
      >
        <RefreshCw className="size-3.5" />
      </button>
    )}
    <button
      type="button"
      aria-label="Good answer"
      title="Good answer"
      aria-pressed={rating === "good"}
      onClick={() => onRate("good")}
      className={`${iconButton} ${rating === "good" ? "bg-muted text-foreground" : ""}`}
    >
      <ThumbsUp className="size-3.5" fill={rating === "good" ? "currentColor" : "none"} />
    </button>
    <button
      type="button"
      aria-label="Bad answer"
      title="Bad answer"
      aria-pressed={rating === "bad"}
      onClick={() => onRate("bad")}
      className={`${iconButton} ${rating === "bad" ? "bg-muted text-foreground" : ""}`}
    >
      <ThumbsDown className="size-3.5" fill={rating === "bad" ? "currentColor" : "none"} />
    </button>
    {versions}
    {children}
  </div>
)

/** The last question, asked again in other words. The first answer stays as a version. */
export const EditQuestion = ({
  agent,
  text,
  onCancel,
  onSend
}: {
  readonly agent: Agent
  readonly text: string
  readonly onCancel: () => void
  readonly onSend: (text: string) => void
}) => {
  const [value, setValue] = useState(text)
  const send = () => {
    if (value.trim() !== "" && value.trim() !== text.trim()) onSend(value.trim())
  }
  return (
    <div className="ml-auto flex w-full max-w-[560px] flex-col gap-2 rounded-card border bg-field p-3">
      <textarea
        aria-label="Edit question"
        // biome-ignore lint/a11y/noAutofocus: the person just asked to edit this
        autoFocus
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
        className="w-full resize-none bg-transparent text-sm leading-5 outline-none"
      />
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-muted-foreground">
          {agent.name} answers again. The first answer stays.
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={send}>
          Send
        </Button>
      </div>
    </div>
  )
}

/** Copy and edit under the last question. */
export const QuestionActions = ({
  question,
  canEdit,
  pinned,
  versions,
  onEdit
}: {
  readonly question: ChatMessage
  readonly canEdit: boolean
  readonly pinned: boolean
  readonly versions: ReactNode
  readonly onEdit: () => void
}) => (
  <div
    className={`flex items-center justify-end gap-0.5 transition-opacity duration-150 ${
      pinned ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
    }`}
  >
    <CopyButton text={question.text} />
    {canEdit && (
      <button type="button" aria-label="Edit" title="Edit" onClick={onEdit} className={iconButton}>
        <Pencil className="size-3.5" />
      </button>
    )}
    {versions}
  </div>
)

/** The last question has no answer: the model failed, or the app closed while it was thinking. */
export const FailedAnswer = ({
  agent,
  error,
  busy,
  onTryAgain
}: {
  readonly agent: Agent
  readonly error: string | null
  readonly busy: boolean
  readonly onTryAgain: () => void
}) => (
  <div
    role="alert"
    className="flex items-center gap-3 rounded-card border border-destructive/35 bg-destructive/[0.06] px-4 py-3"
  >
    <CircleAlert className="size-4 shrink-0 text-destructive" />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-sm font-medium">{agent.name} couldn't answer</span>
      <span className="text-[13px] text-muted-foreground">{error ?? "This question has no answer yet."}</span>
    </span>
    <Button size="sm" disabled={busy || !agent.active} onClick={onTryAgain}>
      <RefreshCw className="size-3.5" />
      Try again
    </Button>
  </div>
)
