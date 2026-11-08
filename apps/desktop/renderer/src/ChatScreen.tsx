import {
  type Agent,
  type AgentSettings,
  type ChatImage,
  type ChatMessage,
  type ConversationSummary,
  type Department,
  type Escalation,
  MAX_MESSAGE_IMAGES,
  type SearchHit
} from "@scope-bot/domain"
import { ThinkingShimmer } from "@scope-bot/ui/components/agents/loading-states/thinking-shimmer.tsx"
import { MessageBubble, MessageBubbleContent } from "@scope-bot/ui/components/agents/message-bubble.tsx"
import { PromptInput } from "@scope-bot/ui/components/agents/prompt-input.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { AudioLines, CircleHelp, FileText, Image, Puzzle, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { AgentSettingsPanel, toSettings } from "./AgentSettingsPanel.tsx"
import { EmployeeAvatar, watchArea } from "./Avatar.tsx"
import { ChatTabs } from "./ChatTabs.tsx"
import { CloseChatModal } from "./CloseChatModal.tsx"
import { errorMessage, useConversations } from "./hooks.ts"
import { toChatImage } from "./imageAttachment.ts"
import { ModelField } from "./ModelSettings.tsx"
import { TitleBar } from "./TitleBar.tsx"

interface ChatScreenProps {
  readonly agent: Agent
  readonly departments: ReadonlyArray<Department>
  /** Where a search result wants to land. */
  readonly target: SearchHit | null
  readonly showSettings: boolean
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

const EmptyChat = ({ agent }: { readonly agent: Agent }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
    <EmployeeAvatar agent={agent} size={96} live />
    <p className="text-sm text-muted-foreground">Write as a customer would and see how {agent.name} answers.</p>
  </div>
)

const PendingReply = ({
  agent,
  text,
  images,
  shown
}: {
  readonly agent: Agent
  readonly text: string
  readonly images: ReadonlyArray<ChatImage>
  readonly shown: boolean
}) => (
  <>
    {!shown && <CustomerBubble text={text} images={images} />}
    <div className="flex items-center gap-2">
      <AgentAvatar agent={agent} />
      <ThinkingShimmer className="text-sm">{`${agent.name} is typing…`}</ThinkingShimmer>
    </div>
  </>
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

  const reload = useCallback(async () => {
    const [nextMessages, nextState] = await Promise.all([
      window.scopeBot.listMessages(agentId, conversationId),
      window.scopeBot.getChatState(agentId, conversationId)
    ])
    if (nextMessages.ok) setMessages(nextMessages.value)
    else setError(errorMessage(nextMessages.error))
    if (nextState.ok) setEscalation(nextState.value.escalation)
  }, [agentId, conversationId])

  useEffect(() => {
    void reload()
  }, [reload])

  const send = async (text: string, images: ReadonlyArray<ChatImage>) => {
    setError(null)
    setPendingText(text)
    setPendingImages(images)
    const result = await window.scopeBot.sendMessage(agentId, conversationId, text, images)
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

  return { messages, escalation, pendingText, pendingImages, asides, error, send, ask, resume, setError }
}

const Conversation = ({
  agent,
  conversationId,
  focusMessageId,
  onFocused,
  onChanged
}: {
  readonly agent: Agent
  readonly conversationId: string
  readonly focusMessageId: string | null
  readonly onFocused: () => void
  readonly onChanged: () => void
}) => {
  const { messages, escalation, pendingText, pendingImages, asides, error, send, ask, resume, setError } = useChat(
    agent.id,
    conversationId,
    onChanged
  )
  const [highlighted, setHighlighted] = useState<string | null>(null)

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

  const [images, setImages] = useState<ReadonlyArray<ChatImage>>([])
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
  }

  return (
    <div {...watchArea} className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-end gap-4 px-6 pt-6 pb-4">
            {messages.length === 0 && pendingText === null && <EmptyChat agent={agent} />}

            {messages.map((message) => (
              <div
                key={message.id}
                data-message-id={message.id}
                className={`rounded-card transition-colors duration-500 ${message.id === highlighted ? "bg-muted" : ""}`}
              >
                <Message agent={agent} message={message} />
              </div>
            ))}

            {pendingText !== null && (
              <PendingReply
                agent={agent}
                text={pendingText}
                images={pendingImages}
                shown={messages.at(-1)?.text === pendingText}
              />
            )}

            {asides.map((aside) => (
              <AsideCard key={aside.id} agent={agent} aside={aside} />
            ))}

            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {/* A new key remounts the anchor, which scrolls the thread to the end. */}
            <div
              key={`${messages.length}-${pendingText}-${error}-${escalation?.id}-${asides.length}`}
              ref={scrollIntoView}
            />
          </div>
        </div>

        {escalation !== null && <HandoffNotice agent={agent} escalation={escalation} onResume={() => void resume()} />}

        <div className="flex w-full max-w-[1120px] shrink-0 flex-col gap-2 px-6 pb-5">
          {(images.length > 0 || sideQuestion) && (
            <div className="flex flex-wrap items-center gap-2">
              {sideQuestion && (
                <span className="flex h-8 items-center gap-1.5 rounded-control-sm border pl-3 pr-1 text-[13px]">
                  Side question
                  <button
                    type="button"
                    aria-label="Cancel side question"
                    onClick={() => setSideQuestion(false)}
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
                      onClick={() => setImages(images.filter((_, position) => position !== index))}
                      className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}
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
          <PromptInput
            inline
            allowEmpty={images.length > 0 && !sideQuestion}
            aria-label="Message"
            placeholder={
              sideQuestion
                ? `Ask ${agent.name} something the customer will not see`
                : agent.active
                  ? `Message ${agent.name}`
                  : `${agent.name} is paused`
            }
            disabled={!agent.active && !sideQuestion}
            loading={pendingText !== null}
            minRows={1}
            maxRows={6}
            className="[&_textarea]:[scrollbar-width:none]"
            actions={[
              { value: "image", label: "Attach image", icon: <Image />, disabled: images.length >= MAX_MESSAGE_IMAGES },
              { value: "skill", label: "Use skill", icon: <Puzzle />, disabled: true },
              { value: "context", label: "Add context", icon: <FileText />, disabled: true },
              { value: "side-question", label: "Side question", icon: <CircleHelp /> },
              { value: "voice", label: "Voice", icon: <AudioLines />, disabled: true }
            ]}
            onAction={runAction}
            onSubmit={submit}
          />
        </div>
      </div>
    </div>
  )
}

export const ChatScreen = ({
  agent,
  departments,
  target,
  showSettings,
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
            onChanged={() => {
              void chats.reload()
              onChatChanged()
            }}
          />
        )}
        {showSettings && (
          <AgentSettingsPanel
            agent={agent}
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
