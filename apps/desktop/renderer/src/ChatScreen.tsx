import type { Agent, AgentAction, AgentSettings, ChatMessage, Escalation } from "@scope-bot/domain"
import { AgentActivity, type AgentActivityItem } from "@scope-bot/ui/components/agents/agent-activity/index.tsx"
import { ThinkingShimmer } from "@scope-bot/ui/components/agents/loading-states/thinking-shimmer.tsx"
import { MessageBubble, MessageBubbleContent } from "@scope-bot/ui/components/agents/message-bubble.tsx"
import { PromptInput } from "@scope-bot/ui/components/agents/prompt-input.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { MessageSquare, Settings } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { AgentSettingsScreen } from "./AgentSettingsScreen.tsx"
import { errorMessage } from "./hooks.ts"
import { LiveMascot, Mascot, watchArea } from "./Mascot.tsx"
import { TitleBar } from "./TitleBar.tsx"

interface ChatScreenProps {
  readonly agent: Agent
  readonly onSaveSettings: (settings: AgentSettings) => Promise<string | null>
  readonly onRemove: () => Promise<string | null>
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

const toActivity = (action: AgentAction): AgentActivityItem => ({
  id: action.id,
  type: "step",
  label: action.summary,
  // A failed step must not look done, so it keeps the neutral marker.
  status: action.status === "done" ? "complete" : "pending",
  meta: timeOf(action.createdAt)
})

const scrollIntoView = (element: HTMLDivElement | null) => element?.scrollIntoView({ block: "end" })

const AgentAvatar = ({ agent }: { readonly agent: Agent }) => (
  <Mascot size={24} shape={agent.shape} face={agent.face} color={agent.color} />
)

const CustomerBubble = ({ text }: { readonly text: string }) => (
  <MessageBubble variant="soft" align="end">
    <MessageBubbleContent>{text}</MessageBubbleContent>
  </MessageBubble>
)

const Message = ({ agent, message }: { readonly agent: Agent; readonly message: ChatMessage }) =>
  message.role === "customer" ? (
    <CustomerBubble text={message.text} />
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
    <LiveMascot size={96} shape={agent.shape} face={agent.face} color={agent.color} />
    <p className="text-sm text-muted-foreground">Write as a customer would and see how {agent.name} answers.</p>
  </div>
)

const PendingReply = ({
  agent,
  text,
  shown
}: {
  readonly agent: Agent
  readonly text: string
  readonly shown: boolean
}) => (
  <>
    {!shown && <CustomerBubble text={text} />}
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
  <div className="w-full max-w-[620px] shrink-0 px-6 pb-3">
    <div role="status" className="flex items-center justify-between gap-4 rounded-2xl bg-muted px-4 py-3">
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

const ActivityPanel = ({ agent, actions }: { readonly agent: Agent; readonly actions: ReadonlyArray<AgentAction> }) => (
  <aside className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-l p-4">
    <h2 className="text-[13px] font-medium text-muted-foreground">What {agent.name} did</h2>
    {actions.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nothing yet. Every action shows up here.</p>
    ) : (
      <AgentActivity
        items={actions.map(toActivity)}
        status="complete"
        summary={`${actions.length} ${actions.length === 1 ? "action" : "actions"}`}
        collapseOnComplete={false}
        defaultOpen
      />
    )}
  </aside>
)

const useChat = (agentId: string) => {
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const [actions, setActions] = useState<ReadonlyArray<AgentAction>>([])
  const [escalation, setEscalation] = useState<Escalation | null>(null)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [nextMessages, nextActions, nextState] = await Promise.all([
      window.scopeBot.listMessages(agentId),
      window.scopeBot.listActions(agentId),
      window.scopeBot.getChatState(agentId)
    ])
    if (nextMessages.ok) setMessages(nextMessages.value)
    else setError(errorMessage(nextMessages.error))
    if (nextActions.ok) setActions(nextActions.value)
    if (nextState.ok) setEscalation(nextState.value.escalation)
  }, [agentId])

  useEffect(() => {
    void reload()
  }, [reload])

  const send = async (text: string) => {
    setError(null)
    setPendingText(text)
    const result = await window.scopeBot.sendMessage(agentId, text)
    // The server keeps the customer's message even when the reply fails.
    await reload()
    setPendingText(null)
    if (!result.ok) setError(errorMessage(result.error))
  }

  const resume = async () => {
    const result = await window.scopeBot.resumeAgent(agentId)
    if (result.ok) setEscalation(result.value.escalation)
    else setError(errorMessage(result.error))
  }

  return { messages, actions, escalation, pendingText, error, send, resume }
}

const Conversation = ({ agent }: { readonly agent: Agent }) => {
  const { messages, actions, escalation, pendingText, error, send, resume } = useChat(agent.id)

  return (
    <div {...watchArea} className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-end gap-4 px-6 pt-6 pb-4">
            {messages.length === 0 && pendingText === null && <EmptyChat agent={agent} />}

            {messages.map((message) => (
              <Message key={message.id} agent={agent} message={message} />
            ))}

            {pendingText !== null && (
              <PendingReply agent={agent} text={pendingText} shown={messages.at(-1)?.text === pendingText} />
            )}

            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {/* A new key remounts the anchor, which scrolls the thread to the end. */}
            <div key={`${messages.length}-${pendingText}-${error}-${escalation?.id}`} ref={scrollIntoView} />
          </div>
        </div>

        {escalation !== null && <HandoffNotice agent={agent} escalation={escalation} onResume={() => void resume()} />}

        <div className="w-full max-w-[620px] shrink-0 px-6 pb-5">
          <PromptInput
            aria-label="Message"
            placeholder={agent.active ? `Message ${agent.name}` : `${agent.name} is paused`}
            disabled={!agent.active}
            loading={pendingText !== null}
            minRows={1}
            maxRows={6}
            className="[&_textarea]:[scrollbar-width:none]"
            onSubmit={send}
          />
        </div>
      </div>

      <ActivityPanel agent={agent} actions={actions} />
    </div>
  )
}

export const ChatScreen = ({ agent, onSaveSettings, onRemove }: ChatScreenProps) => {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <TitleBar>
        <Mascot size={20} shape={agent.shape} face={agent.face} color={agent.color} />
        <span className="text-sm font-semibold">{agent.name}</span>
        <span className="text-sm text-muted-foreground">{agent.job}</span>
        {!agent.active && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Paused</span>}
        <div className="window-no-drag ml-auto">
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? <MessageSquare className="size-4" /> : <Settings className="size-4" />}
            {showSettings ? "Chat" : "Settings"}
          </Button>
        </div>
      </TitleBar>

      {showSettings ? (
        <AgentSettingsScreen agent={agent} onSave={onSaveSettings} onRemove={onRemove} />
      ) : (
        <Conversation agent={agent} />
      )}
    </>
  )
}
