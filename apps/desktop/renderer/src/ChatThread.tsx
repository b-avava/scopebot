import { type Agent, type ChatMessage, type FeedbackRating, type MessageFeedback, versionsOf } from "@scope-bot/domain"
import type { ReactNode } from "react"
import { AnswerActions, EditQuestion, QuestionActions, StepsLine, VersionSwitcher } from "./AnswerParts.tsx"
import { EmployeeAvatar } from "./Avatar.tsx"
import { ChatCards } from "./ChatCards.tsx"
import type { AnswerSteps } from "./chatThread.ts"
import { FeedbackCard } from "./FeedbackCard.tsx"
import { MarkdownText } from "./MarkdownText.tsx"
import { messageTime } from "./messageTime.ts"

/** Everything a thread needs to show versions, steps and feedback (ADR 0023). */
export interface ThreadContext {
  readonly agent: Agent
  readonly conversationId: string
  readonly messages: ReadonlyArray<ChatMessage>
  readonly steps: ReadonlyMap<string, AnswerSteps>
  readonly ratings: ReadonlyMap<string, FeedbackRating>
  /** The last question and answer as shown, when they are the latest versions. */
  readonly lastQuestionId: string | null
  readonly lastAnswerId: string | null
  readonly busy: boolean
  readonly canManageRules: boolean
  readonly editingId: string | null
  readonly feedbackForId: string | null
  readonly onShowVersion: (message: ChatMessage) => void
  readonly onEdit: (id: string | null) => void
  readonly onSendEdit: (text: string) => void
  readonly onAnswerAgain: () => void
  readonly onRate: (answer: ChatMessage, rating: FeedbackRating) => void
  readonly onFeedbackSaved: (feedback: MessageFeedback) => void
  readonly onCloseFeedback: () => void
  /** Changes whenever the chat reloads, so cards look at the calendar again. */
  readonly refresh: number
  readonly onOpenCalendar: (day: string) => void
}

const Versions = ({ context, message }: { readonly context: ThreadContext; readonly message: ChatMessage }) => {
  const versions = versionsOf(context.messages, message)
  if (versions.length < 2) return null
  return (
    <>
      {message.role === "customer" && <span className="px-1 text-xs text-muted-foreground">Edited</span>}
      <VersionSwitcher versions={versions} shown={message} onShow={context.onShowVersion} />
    </>
  )
}

export const CustomerQuestion = ({
  context,
  message,
  bubble
}: {
  readonly context: ThreadContext
  readonly message: ChatMessage
  readonly bubble: ReactNode
}) => {
  const last = message.id === context.lastQuestionId
  if (last && context.editingId === message.id) {
    return (
      <EditQuestion
        agent={context.agent}
        text={message.text}
        onCancel={() => context.onEdit(null)}
        onSend={context.onSendEdit}
      />
    )
  }
  return (
    <div className="group flex flex-col gap-1">
      {bubble}
      <QuestionActions
        question={message}
        canEdit={last && !context.busy && context.agent.active}
        pinned={versionsOf(context.messages, message).length > 1}
        versions={<Versions context={context} message={message} />}
        onEdit={() => context.onEdit(message.id)}
      />
    </div>
  )
}

/** The employee's answer: who and when, what it did, the text, and what can be done with it. */
export const AgentAnswer = ({
  context,
  message
}: {
  readonly context: ThreadContext
  readonly message: ChatMessage
}) => {
  const { agent } = context
  const steps = context.steps.get(message.id)
  const last = message.id === context.lastAnswerId
  return (
    <div className="group flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <EmployeeAvatar agent={agent} size={24} />
        <span className="text-sm font-semibold">{agent.name}</span>
        <span className="text-xs text-muted-foreground">{messageTime(message.createdAt, new Date())}</span>
      </div>
      {steps !== undefined && (steps.steps.length > 0 || steps.reason !== null) && <StepsLine answer={steps} />}
      <MarkdownText text={message.text} />
      {message.cards !== undefined && message.cards.length > 0 && (
        <ChatCards cards={message.cards} refresh={context.refresh} onOpenCalendar={context.onOpenCalendar} />
      )}
      <AnswerActions
        answer={message}
        rating={context.ratings.get(message.id) ?? null}
        last={last && context.agent.active}
        pinned={last || versionsOf(context.messages, message).length > 1}
        busy={context.busy}
        versions={<Versions context={context} message={message} />}
        onAnswerAgain={context.onAnswerAgain}
        onRate={(rating) => context.onRate(message, rating)}
      >
        {message.cards !== undefined && message.cards.length > 0 && (
          <span className="ml-1 border-l pl-3 text-xs text-muted-foreground">From the calendar, as it is now</span>
        )}
      </AnswerActions>
      {context.feedbackForId === message.id && (
        <FeedbackCard
          agent={agent}
          conversationId={context.conversationId}
          answer={message}
          canManageRules={context.canManageRules}
          onSaved={context.onFeedbackSaved}
          onClose={context.onCloseFeedback}
        />
      )}
    </div>
  )
}
