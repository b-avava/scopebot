import type { Agent, LiveAnswer } from "@scope-bot/domain"
import { ThinkingShimmer } from "@scope-bot/ui/components/agents/loading-states/thinking-shimmer.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Check, CircleAlert, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react"
import { EmployeeAvatar } from "./Avatar.tsx"
import { MarkdownText } from "./MarkdownText.tsx"

const Author = ({ agent, note }: { readonly agent: Agent; readonly note: string }) => (
  <div className="flex items-center gap-2">
    <EmployeeAvatar agent={agent} size={24} live />
    <span className="text-sm font-semibold">{agent.name}</span>
    <span className="text-xs text-muted-foreground">{note}</span>
  </div>
)

/** What the employee did so far, open while it works (ADR 0025). */
const LiveSteps = ({ live }: { readonly live: LiveAnswer }) => (
  <div className="flex w-full max-w-[760px] flex-col gap-2.5 rounded-card border px-3 py-2.5 text-[13px]">
    <span className="text-xs font-medium text-muted-foreground">Working on it · step {live.steps.length + 1}</span>
    <ol className="flex flex-col gap-2">
      {live.steps.map((step) => (
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
      <li className="flex items-center gap-2.5">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
        <span>{live.text === "" ? "Thinking it over…" : "Writing the answer…"}</span>
      </li>
    </ol>
  </div>
)

/** The server is out of reach while it answers: it goes on there, and the chat reloads from it. */
const LostServer = ({ agent }: { readonly agent: Agent }) => (
  <span
    role="status"
    className="flex h-9 items-center gap-2.5 self-start rounded-control border bg-field px-3 text-[13px]"
  >
    <span className="size-2 shrink-0 rounded-full bg-amber-400" />
    <span className="font-medium">Lost the server. {agent.name} keeps answering there</span>
    <span className="text-muted-foreground">· the answer shows when it's back</span>
  </span>
)

/** An answer being written, as far as it got. */
export const LiveReply = ({
  agent,
  live,
  lost
}: {
  readonly agent: Agent
  readonly live: LiveAnswer
  readonly lost: boolean
}) => (
  <div className="flex flex-col items-start gap-2" aria-live="polite">
    <Author agent={agent} note="answering…" />
    {live.steps.length > 0 && <LiveSteps live={live} />}
    {live.text === "" && live.steps.length === 0 && (
      <ThinkingShimmer className="text-sm">{`${agent.name} is thinking…`}</ThinkingShimmer>
    )}
    {/* The caret is a character, so it stays at the end of whatever the text ends in. */}
    {live.text !== "" && <MarkdownText text={`${live.text.trimEnd()} ▍`} />}
    {lost && <LostServer agent={agent} />}
  </div>
)

/** An answer that did not finish: a person stopped it, or the model broke off. Nothing of it was saved. */
export const UnfinishedReply = ({
  agent,
  live,
  error,
  busy,
  onAnswerAgain
}: {
  readonly agent: Agent
  readonly live: LiveAnswer
  readonly error: string | null
  readonly busy: boolean
  readonly onAnswerAgain: () => void
}) => (
  <div className="flex flex-col items-start gap-2">
    <Author agent={agent} note={live.status === "stopped" ? "stopped" : "broke off"} />
    <div className="opacity-55">
      <MarkdownText text={`${live.text.trimEnd()} —`} />
    </div>
    {live.status === "stopped" ? (
      <div className="flex items-center gap-2">
        <span className="flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-[2px] bg-muted-foreground" />
          You stopped it
        </span>
        <Button size="sm" variant="ghost" disabled={busy || !agent.active} onClick={onAnswerAgain}>
          Answer again
        </Button>
      </div>
    ) : (
      <div
        role="alert"
        className="flex w-full max-w-[760px] items-center gap-3 rounded-card border border-destructive/35 bg-destructive/[0.06] px-4 py-3"
      >
        <CircleAlert className="size-4 shrink-0 text-destructive" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">{agent.name} stopped mid-answer</span>
          <span className="text-[13px] text-muted-foreground">
            {error ?? "The model broke off."} This part isn't saved, and nothing reached a client.
          </span>
        </span>
        <Button size="sm" disabled={busy || !agent.active} onClick={onAnswerAgain}>
          <RefreshCw className="size-3.5" />
          Answer again
        </Button>
      </div>
    )}
    <p className="text-xs text-muted-foreground">
      The text that came stays greyed until you answer again. Steps already done stay done.
    </p>
  </div>
)
