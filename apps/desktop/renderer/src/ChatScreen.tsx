import {
  type Agent,
  type AgentAction,
  type AgentSettings,
  type ChatImage,
  type ChatMessage,
  type ConversationSummary,
  type Department,
  type Escalation,
  type FeedbackRating,
  MAX_MESSAGE_IMAGES,
  type MessageFeedback,
  type MessageId,
  type SearchHit,
  versionRoot,
  visibleMessages
} from "@scope-bot/domain"
import { ThinkingShimmer } from "@scope-bot/ui/components/agents/loading-states/thinking-shimmer.tsx"
import { MessageBubble, MessageBubbleContent } from "@scope-bot/ui/components/agents/message-bubble.tsx"
import { PromptInput } from "@scope-bot/ui/components/agents/prompt-input.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { AudioLines, CircleHelp, FileText, Image, Puzzle, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AgentSettingsPanel, toSettings } from "./AgentSettingsPanel.tsx"
import { FailedAnswer } from "./AnswerParts.tsx"
import { EmployeeAvatar, watchArea } from "./Avatar.tsx"
import { useCalendar } from "./CalendarContext.tsx"
import { ChatTabs } from "./ChatTabs.tsx"
import { AgentAnswer, CustomerQuestion, type ThreadContext } from "./ChatThread.tsx"
import { CloseChatModal } from "./CloseChatModal.tsx"
import { lastExchange, stepsByAnswer, unansweredQuestion } from "./chatThread.ts"
import { errorMessage, useConversations } from "./hooks.ts"
import { toChatImage } from "./imageAttachment.ts"
import { LiveReply, UnfinishedReply } from "./LiveReply.tsx"
import { ModelField } from "./ModelSettings.tsx"
import { SuggestionCard, suggestionOf } from "./SuggestionCard.tsx"
import { TitleBar } from "./TitleBar.tsx"
import { useLiveAnswer } from "./useLiveAnswer.ts"
import { RecordingBar, useVoiceInput, useVoiceReady, VoiceProblem } from "./VoiceInput.tsx"

interface ChatScreenProps {
  readonly agent: Agent
  readonly departments: ReadonlyArray<Department>
  /** Where a search result wants to land. */
  readonly target: SearchHit | null
  readonly showSettings: boolean
  /** Owners and admins add rules at once; members suggest them. */
  readonly canManageRules: boolean
  /** A question to send as soon as the chat is open, asked from another screen. */
  readonly question?: string | null
  readonly onAsked?: () => void
  /** Opens the calendar on a day a card in the chat shows. */
  readonly onOpenCalendar: (day: string) => void
  /** A message or a whole chat came or went. */
  readonly onChatChanged: () => void
  readonly onCloseSettings: () => void
  readonly onOpenBusiness: () => void
  readonly onSaveSettings: (settings: AgentSettings) => Promise<string | null>
  readonly onRemove: () => void
}

const HIGHLIGHT_MS = 1800

// A ref callback may return its cleanup, and newer browsers return a promise from scrolling.
const scrollIntoView = (element: HTMLDivElement | null) => {
  void element?.scrollIntoView({ block: "end" })
}

const AgentAvatar = ({ agent }: { readonly agent: Agent }) => <EmployeeAvatar agent={agent} size={24} />

const imageUrl = (image: ChatImage) => `data:${image.mediaType};base64,${image.data}`

const CustomerBubble = ({
  text,
  images = []
}: {
  readonly text: string
  readonly images?: ReadonlyArray<ChatImage> | undefined
}) => (
  <div className="flex flex-col items-end gap-1.5">
    {images.length > 0 && (
      <div className="flex flex-wrap justify-end gap-1.5">
        {images.map((image, index) => (
          <img
            key={image.data.slice(0, 64) + String(index)}
            src={imageUrl(image)}
            alt="Attached by the customer"
            className="max-h-56 max-w-72 rounded-xl border object-cover"
          />
        ))}
      </div>
    )}
    {text !== "" && (
      <MessageBubble variant="soft" align="end">
        <MessageBubbleContent>{text}</MessageBubbleContent>
      </MessageBubble>
    )}
  </div>
)

const Message = ({ agent, message }: { readonly agent: Agent; readonly message: ChatMessage }) =>
  message.role === "note" ? (
    <p className="text-center text-[13px] text-muted-foreground">{message.text}</p>
  ) : message.role === "customer" ? (
    <CustomerBubble text={message.text} images={message.images} />
  ) : (
    <div className="flex items-end gap-2">
      <AgentAvatar agent={agent} />
      <MessageBubble variant="outline" align="start">
        <MessageBubbleContent className="whitespace-pre-wrap">{message.text}</MessageBubbleContent>
      </MessageBubble>
    </div>
  )

/** A message, or an employee's suggestion that waits for the person. */
const ThreadItem = ({
  context,
  message,
  onChanged,
  onAnotherTime
}: {
  readonly context: ThreadContext
  readonly message: ChatMessage
  readonly onChanged: () => Promise<void>
  readonly onAnotherTime: () => void
}) => {
  const { agent, conversationId } = context
  const step = suggestionOf(message)
  if (step === null && message.role === "customer") {
    return (
      <CustomerQuestion
        context={context}
        message={message}
        bubble={<CustomerBubble text={message.text} images={message.images} />}
      />
    )
  }
  if (step === null && message.role === "agent") return <AgentAnswer context={context} message={message} />
  if (step === null) return <Message agent={agent} message={message} />
  return (
    <div className="flex items-end gap-2">
      <AgentAvatar agent={agent} />
      <SuggestionCard
        agentId={agent.id}
        conversationId={conversationId}
        message={message}
        step={step}
        onChanged={onChanged}
        onAnotherTime={onAnotherTime}
      />
    </div>
  )
}

const EmptyChat = ({ agent, calendar }: { readonly agent: Agent; readonly calendar: boolean }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <EmployeeAvatar agent={agent} size={96} live />
    <p className="text-sm text-muted-foreground">
      {calendar
        ? `Ask ${agent.name} about your clients and appointments, or write as a customer would to see how ${agent.name} answers.`
        : `Write as a customer would and see how ${agent.name} answers.`}
    </p>
  </div>
)

/** Questions the team asks most about the schedule. */
const QUICK_QUESTIONS = ["My day today", "This week", "Who hasn't confirmed?", "Free time on Friday"]

const QuickQuestions = ({ onAsk }: { readonly onAsk: (text: string) => void }) => (
  <div className="flex flex-wrap gap-2">
    {QUICK_QUESTIONS.map((question) => (
      <button
        key={question}
        type="button"
        onClick={() => onAsk(question)}
        className="h-8 rounded-control-sm border px-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {question}
      </button>
    ))}
  </div>
)

/** Until the server has it, the employee has not started yet. */
const Waiting = ({ agent }: { readonly agent: Agent }) => (
  <div className="flex items-center gap-2">
    <AgentAvatar agent={agent} />
    <ThinkingShimmer className="text-sm">{`${agent.name} is typing…`}</ThinkingShimmer>
  </div>
)

const HandoffNotice = ({
  agent,
  escalation,
  onResume
}: {
  readonly agent: Agent
  readonly escalation: Escalation
  readonly onResume: () => void
}) => (
  <div className="w-full max-w-[1120px] shrink-0 px-6 pb-3">
    <div role="status" className="flex items-center justify-between gap-4 rounded-card bg-muted px-4 py-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{agent.name} passed this chat to you</span>
        <span className="truncate text-[13px] text-muted-foreground">{escalation.reason}</span>
      </span>
      <Button size="sm" onClick={onResume}>
        Give back to {agent.name}
      </Button>
    </div>
  </div>
)

interface Aside {
  readonly id: string
  readonly question: string
  /** Null while the agent is thinking. */
  readonly answer: string | null
}

/** Only the supervisor sees these, and they are gone when the chat is reopened. */
const AsideCard = ({ agent, aside }: { readonly agent: Agent; readonly aside: Aside }) => (
  <div className="flex flex-col gap-1.5 rounded-card border border-dashed px-4 py-3 text-sm">
    <span className="text-xs font-medium text-muted-foreground">Side question</span>
    <p className="whitespace-pre-wrap font-medium">{aside.question}</p>
    {aside.answer === null ? (
      <ThinkingShimmer className="text-sm">{`${agent.name} is thinking…`}</ThinkingShimmer>
    ) : (
      <p className="whitespace-pre-wrap text-muted-foreground">{aside.answer}</p>
    )}
  </div>
)

const useChat = (agentId: string, conversationId: string, onChanged: () => void) => {
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const [escalation, setEscalation] = useState<Escalation | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<ReadonlyArray<ChatImage>>([])
  const [asides, setAsides] = useState<ReadonlyArray<Aside>>([])
  const [error, setError] = useState<string | null>(null)
  const [actions, setActions] = useState<ReadonlyArray<AgentAction>>([])
  const [ratings, setRatings] = useState<ReadonlyMap<string, FeedbackRating>>(new Map())
  /** The version a person picked, by the first version's id. The latest is shown otherwise. */
  const [chosen, setChosen] = useState<ReadonlyMap<MessageId, MessageId>>(new Map())
  /** Answering the last question again, or an edited one. */
  const [answering, setAnswering] = useState(false)
  /** Counts reloads, so cards look at the calendar again after anything changed. */
  const [loads, setLoads] = useState(0)

  const reload = useCallback(async () => {
    const [nextMessages, nextState, nextActions, nextFeedback] = await Promise.all([
      window.scopeBot.listMessages(agentId, conversationId),
      window.scopeBot.getChatState(agentId, conversationId),
      window.scopeBot.listChatActions(agentId, conversationId),
      window.scopeBot.listFeedback(agentId, conversationId)
    ])
    if (nextMessages.ok) setMessages(nextMessages.value)
    else setError(errorMessage(nextMessages.error))
    if (nextState.ok) setEscalation(nextState.value.escalation)
    if (nextActions.ok) setActions(nextActions.value)
    if (nextFeedback.ok) setRatings(new Map(nextFeedback.value.map((item) => [item.messageId, item.rating])))
    setLoads((count) => count + 1)
  }, [agentId, conversationId])

  const live = useLiveAnswer(agentId, conversationId, reload)

  const showVersion = (message: ChatMessage) =>
    setChosen((current) => new Map(current).set(versionRoot(message), message.id))

  /** Answers the last question again, or an edited version of it. The latest versions show after. */
  const answerAgain = async (edited?: string) => {
    setError(null)
    setAnswering(true)
    const result = await live.during(
      edited === undefined
        ? window.scopeBot.answerAgain(agentId, conversationId)
        : window.scopeBot.editQuestion(agentId, conversationId, edited)
    )
    setChosen(new Map())
    await reload()
    setAnswering(false)
    onChanged()
    if (!result.ok) setError(errorMessage(result.error))
  }

  const rated = (feedback: MessageFeedback) =>
    setRatings((current) => new Map(current).set(feedback.messageId, feedback.rating))

  const rateGood = async (answer: ChatMessage) => {
    const result = await window.scopeBot.giveFeedback(agentId, conversationId, answer.id, {
      rating: "good",
      reasons: [],
      note: ""
    })
    if (result.ok) rated(result.value)
    else setError(errorMessage(result.error))
  }

  useEffect(() => {
    void reload()
  }, [reload])

  const send = async (text: string, images: ReadonlyArray<ChatImage>) => {
    setError(null)
    setPendingText(text)
    setPendingImages(images)
    const result = await live.during(window.scopeBot.sendMessage(agentId, conversationId, text, images))
    // The server keeps the customer's message even when the reply fails.
    await reload()
    setPendingText(null)
    onChanged()
    if (!result.ok) setError(errorMessage(result.error))
  }

  const ask = async (question: string) => {
    const id = crypto.randomUUID()
    setError(null)
    setAsides((current) => [...current, { id, question, answer: null }])
    const result = await window.scopeBot.askAgent(agentId, conversationId, question)
    await reload()
    if (result.ok) {
      setAsides((current) => current.map((item) => (item.id === id ? { ...item, answer: result.value.text } : item)))
    } else {
      setAsides((current) => current.filter((item) => item.id !== id))
      setError(errorMessage(result.error))
    }
  }

  const resume = async () => {
    const result = await window.scopeBot.resumeAgent(agentId, conversationId)
    if (result.ok) setEscalation(result.value.escalation)
    else setError(errorMessage(result.error))
  }

  return {
    messages,
    escalation,
    pendingText,
    pendingImages,
    asides,
    error,
    send,
    ask,
    resume,
    setError,
    reload,
    actions,
    ratings,
    chosen,
    answering,
    showVersion,
    answerAgain,
    rated,
    rateGood,
    loads,
    live: live.live,
    lost: live.lost,
    stop: live.stop
  }
}

/** What the thread shows, and which question and answer can still change. */
const useThread = (chat: ReturnType<typeof useChat>) => {
  const { messages, chosen, actions } = chat
  const shown = useMemo(() => visibleMessages(messages, chosen), [messages, chosen])
  const latest = useMemo(() => lastExchange(visibleMessages(messages)), [messages])
  const current = lastExchange(shown)
  // An older version on screen cannot be answered again or edited: the server works on the latest.
  const atLatest = latest.question?.id === current.question?.id && latest.answer?.id === current.answer?.id
  const steps = useMemo(() => stepsByAnswer(actions), [actions])
  return {
    shown,
    steps,
    lastQuestionId: atLatest ? (current.question?.id ?? null) : null,
    lastAnswerId: atLatest ? (current.answer?.id ?? null) : null,
    unanswered: atLatest ? unansweredQuestion(shown) : null
  }
}

/** Where the thread ends: an answer on its way, a question left without one, or an error. */
const ThreadEnd = ({
  agent,
  chat,
  thread
}: {
  readonly agent: Agent
  readonly chat: ReturnType<typeof useChat>
  readonly thread: ReturnType<typeof useThread>
}) => {
  const { pendingText, pendingImages, messages, escalation, error, live } = chat
  const busy = pendingText !== null || chat.answering
  const streaming = live.status === "answering"
  // What came of an answer that was stopped or broke off, for the question still without one.
  const unfinished =
    !busy &&
    !streaming &&
    (live.status === "stopped" || live.status === "broke") &&
    live.text !== "" &&
    live.questionId === thread.unanswered?.id
  // A handed over chat waits for a person, not for another try.
  const failed = thread.unanswered !== null && !busy && !streaming && !unfinished && escalation === null
  return (
    <>
      {pendingText !== null && messages.at(-1)?.text !== pendingText && (
        <CustomerBubble text={pendingText} images={pendingImages} />
      )}
      {streaming && <LiveReply agent={agent} live={live} lost={chat.lost} />}
      {busy && !streaming && <Waiting agent={agent} />}
      {unfinished && (
        <UnfinishedReply
          agent={agent}
          live={live}
          error={error}
          busy={busy}
          onAnswerAgain={() => void chat.answerAgain()}
        />
      )}
      {failed && <FailedAnswer agent={agent} error={error} busy={busy} onTryAgain={() => void chat.answerAgain()} />}
      {chat.asides.map((aside) => (
        <AsideCard key={aside.id} agent={agent} aside={aside} />
      ))}
      {error !== null && !failed && !unfinished && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}

/** Versions, steps and feedback for the thread, with what a person can do to them. */
const useThreadContext = (
  agent: Agent,
  conversationId: string,
  canManageRules: boolean,
  onOpenCalendar: (day: string) => void,
  chat: ReturnType<typeof useChat>,
  thread: ReturnType<typeof useThread>
): ThreadContext => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [feedbackForId, setFeedbackForId] = useState<string | null>(null)
  return {
    agent,
    conversationId,
    messages: chat.messages,
    steps: thread.steps,
    ratings: chat.ratings,
    lastQuestionId: thread.lastQuestionId,
    lastAnswerId: thread.lastAnswerId,
    busy: chat.pendingText !== null || chat.answering,
    canManageRules,
    editingId,
    feedbackForId,
    onShowVersion: chat.showVersion,
    onEdit: setEditingId,
    onSendEdit: (text) => {
      setEditingId(null)
      void chat.answerAgain(text)
    },
    onAnswerAgain: () => void chat.answerAgain(),
    onRate: (answer, rating) => {
      if (rating === "good") void chat.rateGood(answer)
      else setFeedbackForId(answer.id)
    },
    onFeedbackSaved: chat.rated,
    onCloseFeedback: () => setFeedbackForId(null),
    refresh: chat.loads,
    onOpenCalendar
  }
}

const placeholderOf = (agent: Agent, sideQuestion: boolean) =>
  sideQuestion
    ? `Ask ${agent.name} something the customer will not see`
    : agent.active
      ? `Message ${agent.name}`
      : `${agent.name} is paused`

/** Speaking needs a key on the server; without one the button says who adds it. */
const voiceAction = (ready: boolean | null, off: boolean) => ({
  value: "voice",
  label: "Voice",
  icon: <AudioLines />,
  disabled: ready !== true || off,
  ...(ready === false ? { description: "Set up in Providers" } : {})
})

/** The photos to send, or the note that this is a side question. */
const ComposerChips = ({
  images,
  sideQuestion,
  onCancelSide,
  onRemove
}: {
  readonly images: ReadonlyArray<ChatImage>
  readonly sideQuestion: boolean
  readonly onCancelSide: () => void
  readonly onRemove: (index: number) => void
}) => {
  if (images.length === 0 && !sideQuestion) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sideQuestion && (
        <span className="flex h-8 items-center gap-1.5 rounded-control-sm border pl-3 pr-1 text-[13px]">
          Side question
          <button
            type="button"
            aria-label="Cancel side question"
            onClick={onCancelSide}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        </span>
      )}
      {!sideQuestion &&
        images.map((image, index) => (
          <span key={image.data.slice(0, 64) + String(index)} className="relative">
            <img src={imageUrl(image)} alt="Attached" className="size-14 rounded-lg border object-cover" />
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => onRemove(index)}
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
    </div>
  )
}

/** Where a person writes, attaches photos, asks on the side, or speaks. */
const Composer = ({ agent, chat }: { readonly agent: Agent; readonly chat: ReturnType<typeof useChat> }) => {
  const { pendingText, send, ask, setError } = chat
  const { settings } = useCalendar()
  const busy = pendingText !== null || chat.answering || chat.live.status === "answering"
  const [images, setImages] = useState<ReadonlyArray<ChatImage>>([])
  const [draft, setDraft] = useState("")
  const voiceReady = useVoiceReady()
  // What was said goes after what was typed, to check before it is sent.
  const voice = useVoiceInput(
    useCallback(
      (text: string) => setDraft((current) => (current.trim() === "" ? text : `${current.trimEnd()} ${text}`)),
      []
    )
  )
  const [sideQuestion, setSideQuestion] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const attach = async (files: ReadonlyArray<File>) => {
    try {
      const added = await Promise.all(files.map(toChatImage))
      setImages((current) => [...current, ...added].slice(0, MAX_MESSAGE_IMAGES))
    } catch {
      setError("This image could not be read.")
    }
  }

  const submit = (text: string) => {
    setDraft("")
    if (sideQuestion) {
      setSideQuestion(false)
      return ask(text)
    }
    setImages([])
    return send(text, images)
  }

  const runAction = (action: string) => {
    if (action === "image") fileInput.current?.click()
    if (action === "side-question") setSideQuestion(true)
    if (action === "voice") voice.start()
  }

  return (
    <div className="flex w-full max-w-[1120px] shrink-0 flex-col gap-2 px-6 pb-5">
      {settings.enabled && agent.active && !sideQuestion && !busy && voice.recording === null && !voice.writing && (
        <QuickQuestions onAsk={(text) => void send(text, [])} />
      )}
      <ComposerChips
        images={images}
        sideQuestion={sideQuestion}
        onCancelSide={() => setSideQuestion(false)}
        onRemove={(index) => setImages(images.filter((_, position) => position !== index))}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        aria-label="Attach image"
        className="hidden"
        onChange={(event) => {
          void attach([...(event.target.files ?? [])])
          event.target.value = ""
        }}
      />
      <VoiceProblem voice={voice} />
      {voice.recording !== null || voice.writing ? (
        <RecordingBar voice={voice} />
      ) : (
        <PromptInput
          inline
          value={draft}
          onValueChange={setDraft}
          allowEmpty={images.length > 0 && !sideQuestion}
          aria-label="Message"
          placeholder={placeholderOf(agent, sideQuestion)}
          disabled={!agent.active && !sideQuestion}
          loading={busy}
          onStop={chat.live.status === "answering" ? () => void chat.stop() : undefined}
          minRows={1}
          maxRows={6}
          className="[&_textarea]:[scrollbar-width:none]"
          actions={[
            {
              value: "image",
              label: "Attach image",
              icon: <Image />,
              disabled: images.length >= MAX_MESSAGE_IMAGES
            },
            { value: "skill", label: "Use skill", icon: <Puzzle />, disabled: true },
            { value: "context", label: "Add context", icon: <FileText />, disabled: true },
            { value: "side-question", label: "Side question", icon: <CircleHelp /> },
            voiceAction(voiceReady, sideQuestion || !agent.active)
          ]}
          onAction={runAction}
          onSubmit={submit}
        />
      )}
    </div>
  )
}

const Conversation = ({
  agent,
  conversationId,
  focusMessageId,
  onFocused,
  onChanged,
  question,
  onAsked,
  canManageRules,
  onOpenCalendar
}: {
  readonly agent: Agent
  readonly conversationId: string
  readonly focusMessageId: string | null
  readonly onFocused: () => void
  readonly onChanged: () => void
  readonly question: string | null
  readonly onAsked: () => void
  readonly canManageRules: boolean
  readonly onOpenCalendar: (day: string) => void
}) => {
  const chat = useChat(agent.id, conversationId, onChanged)
  const { messages, escalation, pendingText, asides, error, send, resume, reload } = chat
  const thread = useThread(chat)
  const context = useThreadContext(agent, conversationId, canManageRules, onOpenCalendar, chat, thread)
  const { settings } = useCalendar()
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const asked = useRef<string | null>(null)

  // A question from another screen goes once, even if the effect runs twice.
  useEffect(() => {
    if (question === null || asked.current === question) return
    asked.current = question
    onAsked()
    void send(question, [])
  }, [question, onAsked, send])

  useEffect(() => {
    if (focusMessageId === null || !messages.some((message) => message.id === focusMessageId)) return
    document.querySelector(`[data-message-id="${focusMessageId}"]`)?.scrollIntoView({ block: "center" })
    setHighlighted(focusMessageId)
    onFocused()
  }, [focusMessageId, messages, onFocused])

  useEffect(() => {
    if (highlighted === null) return
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [highlighted])

  return (
    <div {...watchArea} className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-end gap-4 px-6 pt-6 pb-4">
            {messages.length === 0 && pendingText === null && <EmptyChat agent={agent} calendar={settings.enabled} />}

            {thread.shown.map((message) => (
              <div
                key={message.id}
                data-message-id={message.id}
                className={`rounded-card transition-colors duration-500 ${message.id === highlighted ? "bg-muted" : ""}`}
              >
                <ThreadItem
                  context={context}
                  message={message}
                  onChanged={reload}
                  onAnotherTime={() => void send("Another time, please.", [])}
                />
              </div>
            ))}

            <ThreadEnd agent={agent} chat={chat} thread={thread} />

            {/* A new key remounts the anchor, which scrolls the thread to the end. */}
            <div
              key={`${messages.length}-${pendingText}-${error}-${escalation?.id}-${asides.length}-${chat.answering}-${chat.live.version}`}
              ref={scrollIntoView}
            />
          </div>
        </div>

        {escalation !== null && <HandoffNotice agent={agent} escalation={escalation} onResume={() => void resume()} />}

        <Composer agent={agent} chat={chat} />
      </div>
    </div>
  )
}

export const ChatScreen = ({
  agent,
  departments,
  target,
  showSettings,
  canManageRules,
  question = null,
  onAsked = () => {},
  onOpenCalendar,
  onChatChanged,
  onCloseSettings,
  onOpenBusiness,
  onSaveSettings,
  onRemove
}: ChatScreenProps) => {
  const chats = useConversations(agent.id)
  const { select } = chats
  const [closing, setClosing] = useState<ConversationSummary | null>(null)
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null)
  const clearFocus = useCallback(() => setFocusMessageId(null), [])

  useEffect(() => {
    if (target?.conversationId == null) return
    select(target.conversationId)
    setFocusMessageId(target.messageId)
  }, [target, select])

  const close = (tab: ConversationSummary) => {
    if (tab.messageCount > 0) setClosing(tab)
    else void chats.remove(tab.id).then(onChatChanged)
  }

  return (
    <>
      <TitleBar>
        <EmployeeAvatar agent={agent} size={20} />
        <span className="text-sm font-semibold">{agent.name}</span>
        <span className="text-sm text-muted-foreground">{agent.job}</span>
        {!agent.active && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Paused</span>}
        <ChatTabs
          tabs={chats.tabs}
          activeId={chats.activeId}
          onSelect={(id) => {
            clearFocus()
            chats.select(id)
          }}
          onCreate={() => void chats.create()}
          onRename={(id, title) => void chats.rename(id, title)}
          onClose={close}
        />
        <div className="window-no-drag ml-auto">
          <ModelField
            compact
            value={agent}
            onChange={(patch) => void onSaveSettings({ ...toSettings(agent), ...patch })}
          />
        </div>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        {chats.activeId !== null && (
          <Conversation
            key={chats.activeId}
            agent={agent}
            conversationId={chats.activeId}
            focusMessageId={focusMessageId}
            onFocused={clearFocus}
            question={question}
            onAsked={onAsked}
            canManageRules={canManageRules}
            onOpenCalendar={onOpenCalendar}
            onChanged={() => {
              void chats.reload()
              onChatChanged()
            }}
          />
        )}
        {showSettings && (
          <AgentSettingsPanel
            agent={agent}
            canManageRules={canManageRules}
            departments={departments}
            onSave={onSaveSettings}
            onRemove={onRemove}
            onClose={onCloseSettings}
            onOpenBusiness={onOpenBusiness}
          />
        )}
      </div>

      <CloseChatModal
        chat={closing}
        onCancel={() => setClosing(null)}
        onConfirm={(chat) => {
          setClosing(null)
          void chats.remove(chat.id).then(onChatChanged)
        }}
      />
    </>
  )
}
