import type { Agent, ChatMessage } from "@scope-bot/domain"
import { ArrowUp, Clock, Search, User } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { EmployeeAvatar } from "./Avatar.tsx"
import { errorMessage } from "./hooks.ts"
import { useChannelMessages } from "./useWhatsApp.ts"

/** One customer chat as the list and the conversation show it, on any channel. */
export interface ChatRow {
  readonly id: string
  readonly agentId: string
  readonly contactId: string | null
  readonly name: string
  /** The number or the @username. Empty when the channel hides it. */
  readonly handle: string
  /** Where the chat came from, when the channel has more than one place. */
  readonly via: string | null
  readonly lastMessage: ChatMessage | null
  readonly drafts: number
  /** Why a person has the chat now, or null while the employee answers. */
  readonly handoff: string | null
  /** On channels that limit how long a business may answer: until when it still can. */
  readonly answerUntil?: string | null
}

/** What a channel gives the chat screens. */
export interface ChannelChatApi {
  readonly logo: ReactNode
  /** Shown instead of the handle when there is none. */
  readonly hiddenHandle: string
  /** Under the box where a person writes. */
  readonly composerHint: string
  listMessages(chatId: string): Promise<BridgeResult<ReadonlyArray<ChatMessage>>>
  send(chatId: string, text: string): Promise<BridgeResult<ChatMessage>>
  sendDraft(id: string, text: string | null): Promise<BridgeResult<ChatMessage>>
  discardDraft(id: string): Promise<BridgeResult<ChatMessage>>
  resume(chatId: string): Promise<BridgeResult<void>>
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("")

const colors = ["#3B8BEB", "#2FB5A0", "#8A5CF0", "#F2772E", "#EC3F97", "#3CBF6E"]
const colorOf = (id: string) =>
  colors[[...id].reduce((sum, letter) => sum + (letter.codePointAt(0) ?? 0), 0) % colors.length]

const ChatAvatar = ({ chat, size }: { readonly chat: ChatRow; readonly size: number }) => (
  <span
    style={{ width: size, height: size, backgroundColor: chat.contactId === null ? undefined : colorOf(chat.id) }}
    className={`flex shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white ${
      chat.contactId === null ? "bg-muted text-foreground" : ""
    }`}
  >
    {chat.contactId === null ? <User className="size-[18px]" /> : initials(chat.name)}
  </span>
)

const timeOf = (iso: string) => {
  const date = new Date(iso)
  const today = new Date().toDateString() === date.toDateString()
  return today
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

const hoursLeft = (until: string) => Math.ceil((Date.parse(until) - Date.now()) / 3_600_000)

/** Whether the channel still lets the business answer, with the time left. */
const AnswerWindow = ({ until }: { readonly until: string }) => {
  const hours = hoursLeft(until)
  return (
    <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium">
      <Clock className="size-3.5 text-muted-foreground" />
      {hours > 0 ? `Answer within ${hours} h` : "Only a person can answer"}
    </span>
  )
}

const preview = (message: ChatMessage | null) => {
  if (message === null) return ""
  if (message.role === "person") return `You: ${message.text}`
  return message.text
}

const closed = (chat: ChatRow) =>
  chat.answerUntil !== undefined && chat.answerUntil !== null && Date.parse(chat.answerUntil) < Date.now()

const ChatRow = ({
  chat,
  selected,
  onSelect
}: {
  readonly chat: ChatRow
  readonly selected: boolean
  readonly onSelect: () => void
}) => (
  <button
    type="button"
    aria-current={selected ? "true" : undefined}
    onClick={onSelect}
    className={`flex w-full items-center gap-3 rounded-control p-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring ${
      selected ? "bg-muted" : "hover:bg-muted"
    }`}
  >
    <ChatAvatar chat={chat} size={40} />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{chat.name}</span>
        {chat.lastMessage !== null && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {timeOf(chat.lastMessage.createdAt)}
          </span>
        )}
      </span>
      {chat.drafts > 0 && (
        <span className="truncate text-[13px] font-medium text-amber-600 dark:text-amber-400">
          Draft waits for your OK
        </span>
      )}
      {chat.drafts === 0 && chat.handoff !== null && (
        <span className="truncate text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">With a person</span>
          {chat.via === null ? "" : ` · ${chat.via}`} · {preview(chat.lastMessage)}
        </span>
      )}
      {chat.drafts === 0 && chat.handoff === null && closed(chat) && (
        <span className="truncate text-[13px] text-muted-foreground">Window closed · only a person can answer</span>
      )}
      {chat.drafts === 0 && chat.handoff === null && !closed(chat) && (
        <span className="truncate text-[13px] text-muted-foreground">
          {chat.contactId === null && chat.handle !== "" ? "New contact · " : ""}
          {chat.via === null ? "" : `${chat.via} · `}
          {preview(chat.lastMessage)}
        </span>
      )}
    </span>
  </button>
)

export const ChatList = ({
  chats,
  selectedId,
  empty,
  searchLabel,
  onSelect
}: {
  readonly chats: ReadonlyArray<ChatRow>
  readonly searchLabel: string
  readonly selectedId: string | null
  readonly empty: string
  readonly onSelect: (id: string) => void
}) => {
  const [query, setQuery] = useState("")
  const text = query.trim().toLowerCase()
  const shown =
    text === ""
      ? chats
      : chats.filter(
          (chat) =>
            chat.name.toLowerCase().includes(text) ||
            chat.handle.toLowerCase().includes(text) ||
            chat.handle.replace(/\D/g, "").includes(text.replace(/\D/g, "") || "\u0000")
        )

  return (
    <div className="flex w-80 shrink-0 flex-col gap-0.5 border-r p-3">
      <label className="mb-2 flex h-9 shrink-0 items-center gap-2 rounded-control-sm border bg-field px-2.5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 text-muted-foreground" />
        <input
          aria-label="Find a chat"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchLabel}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {shown.map((chat) => (
          <ChatRow key={chat.id} chat={chat} selected={chat.id === selectedId} onSelect={() => onSelect(chat.id)} />
        ))}
        {shown.length === 0 && <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">{empty}</p>}
      </div>
    </div>
  )
}

const deliveryNote: Partial<Record<NonNullable<ChatMessage["delivery"]>, string>> = {
  sending: "Sending…",
  failed: "Not delivered"
}

const Bubble = ({ message, agentName }: { readonly message: ChatMessage; readonly agentName: string }) => {
  if (message.role === "note") {
    return <p className="self-center text-xs text-muted-foreground">{message.text}</p>
  }
  if (message.delivery === "discarded") {
    return <p className="self-end text-xs text-muted-foreground line-through">{message.text}</p>
  }
  const fromCustomer = message.role === "customer"
  const author = message.role === "person" ? "You" : message.role === "agent" ? agentName : null
  const note = message.delivery === undefined ? undefined : deliveryNote[message.delivery]
  return (
    <div className={`flex max-w-[520px] flex-col gap-1 ${fromCustomer ? "self-start" : "items-end self-end"}`}>
      <p
        className={`whitespace-pre-wrap rounded-card px-3.5 py-2.5 text-sm leading-5 ${
          fromCustomer ? "bg-muted" : "border bg-field"
        }`}
      >
        {message.text}
      </p>
      <span className={`text-xs ${message.delivery === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
        {[author, timeOf(message.createdAt), note].filter((part) => part !== null && part !== undefined).join(" · ")}
      </span>
    </div>
  )
}

const Draft = ({
  message,
  agent,
  onSend,
  onDiscard
}: {
  readonly message: ChatMessage
  readonly agent: Agent | undefined
  readonly onSend: (text: string | null) => Promise<void>
  readonly onDiscard: () => Promise<void>
}) => {
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    await action()
    setBusy(false)
  }

  return (
    <div className="flex w-[520px] max-w-full flex-col gap-3 self-end rounded-card border border-dashed border-amber-400 bg-amber-400/5 px-4 py-3.5">
      <div className="flex items-center gap-2">
        {agent !== undefined && <EmployeeAvatar agent={agent} size={20} />}
        <span className="flex-1 text-[13px] font-semibold text-amber-600 dark:text-amber-400">
          {agent?.name ?? "The employee"} wants to reply
        </span>
        <span className="text-xs text-muted-foreground">Not sent yet</span>
      </div>
      {message.handoff !== undefined && (
        <p className="text-xs text-muted-foreground">
          Sending it also hands the chat to a person: {message.handoff}. Not sending it keeps{" "}
          {agent?.name ?? "the employee"} answering.
        </p>
      )}
      {editing === null ? (
        <p className="whitespace-pre-wrap text-sm leading-5">{message.text}</p>
      ) : (
        <textarea
          aria-label="Reply"
          value={editing}
          rows={4}
          onChange={(event) => setEditing(event.target.value)}
          className="w-full resize-none rounded-control border bg-field px-3 py-2.5 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || editing?.trim() === ""}
          onClick={() => void run(() => onSend(editing))}
          className="h-8 rounded-control-sm bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Send
        </button>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing(message.text)}
            className="h-8 rounded-control-sm border px-3.5 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(onDiscard)}
          className="h-8 rounded-control-sm px-2.5 text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Don't send
        </button>
      </div>
    </div>
  )
}

const Composer = ({
  name,
  hint,
  onSend
}: {
  readonly name: string
  readonly hint: string
  readonly onSend: (text: string) => Promise<boolean>
}) => {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (text.trim() === "" || busy) return
    setBusy(true)
    if (await onSend(text)) setText("")
    setBusy(false)
  }

  return (
    <form
      className="flex shrink-0 flex-col gap-1.5 px-8 pb-5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex h-[52px] items-center gap-2.5 rounded-card border bg-field pr-2 pl-4 focus-within:ring-2 focus-within:ring-ring">
        <input
          aria-label={`Write to ${name}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Write to ${name} yourself`}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={text.trim() === "" || busy}
          className="flex size-9 shrink-0 items-center justify-center rounded-control-sm bg-primary text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </form>
  )
}

export const Conversation = ({
  chat,
  agents,
  api,
  onChanged
}: {
  readonly chat: ChatRow
  readonly agents: ReadonlyArray<Agent>
  readonly api: ChannelChatApi
  readonly onChanged: () => void
}) => {
  const { messages, reload } = useChannelMessages(api.listMessages, chat.id)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const agent = agents.find((item) => item.id === chat.agentId)
  const shown = messages.filter((message) => message.delivery !== "draft")
  const drafts = messages.filter((message) => message.delivery === "draft")

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the number of messages changes.
  useEffect(() => {
    // Newer browsers return a promise here, which must not become the effect's cleanup.
    void end.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  const after = async (result: BridgeResult<unknown>) => {
    setError(result.ok ? null : errorMessage(result.error))
    await reload()
    onChanged()
    return result.ok
  }

  return (
    <section aria-label={`Chat with ${chat.name}`} className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-5">
        <ChatAvatar chat={chat} size={36} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{chat.name}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {api.logo}
            {chat.handle === "" ? api.hiddenHandle : chat.handle}
          </span>
        </div>
        {chat.answerUntil !== undefined && chat.answerUntil !== null && <AnswerWindow until={chat.answerUntil} />}
        {agent !== undefined && (
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <EmployeeAvatar agent={agent} size={20} />
            {agent.name} answers
          </span>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-8 py-6">
        <div className="flex-1" />
        {shown.map((message) => (
          <Bubble key={message.id} message={message} agentName={agent?.name ?? "Employee"} />
        ))}
        {drafts.map((message) => (
          <Draft
            key={message.id}
            message={message}
            agent={agent}
            onSend={async (text) => {
              await after(await api.sendDraft(message.id, text))
            }}
            onDiscard={async () => {
              await after(await api.discardDraft(message.id))
            }}
          />
        ))}
        <div ref={end} />
      </div>
      {chat.handoff !== null && (
        <div className="mx-8 mb-3 flex items-center gap-3 rounded-card border bg-field px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-medium">{agent?.name ?? "The employee"} handed this chat to a person</p>
            <p className="text-[13px] text-muted-foreground">
              {chat.handoff}. {agent?.name ?? "The employee"} stays quiet until you give it back.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void api.resume(chat.id).then(after)}
            className="h-8 shrink-0 rounded-control-sm border px-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Give it back to {agent?.name ?? "the employee"}
          </button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="px-8 pb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Composer
        name={chat.name}
        hint={api.composerHint}
        onSend={async (text) => after(await api.send(chat.id, text.trim()))}
      />
    </section>
  )
}
