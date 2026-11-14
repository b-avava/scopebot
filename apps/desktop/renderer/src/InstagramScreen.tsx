import { type Agent, INSTAGRAM_REPLY_HOURS } from "@scope-bot/domain"
import { useState } from "react"
import { type ChannelChatApi, ChatList, type ChatRow, Conversation } from "./ChannelChats.tsx"
import { InstagramLogo } from "./ChannelLogos.tsx"
import { Tab } from "./CrmParts.tsx"
import { InstagramConnectView, InstagramSettingsView } from "./InstagramSetup.tsx"
import { TitleBar } from "./TitleBar.tsx"
import { useInstagram, useInstagramChats } from "./useInstagram.ts"

type Section = "chats" | "waiting" | "settings"

const api: ChannelChatApi = {
  logo: <InstagramLogo className="size-3.5 text-[#E1306C]" />,
  hiddenHandle: "Instagram customer",
  composerHint: "Goes to Instagram Direct from your account, as you.",
  listMessages: (chatId) => window.scopeBot.listInstagramMessages(chatId),
  send: (chatId, text) => window.scopeBot.sendInstagram(chatId, text),
  sendDraft: (id, text) => window.scopeBot.sendInstagramDraft(id, text),
  discardDraft: (id) => window.scopeBot.discardInstagramDraft(id),
  resume: (chatId) => window.scopeBot.resumeInstagramChat(chatId)
}

const answerUntil = (lastCustomerAt: string | null) =>
  lastCustomerAt === null
    ? null
    : new Date(Date.parse(lastCustomerAt) + INSTAGRAM_REPLY_HOURS * 3_600_000).toISOString()

const Title = ({
  connected,
  tab,
  chats,
  drafts,
  onTab
}: {
  readonly connected: boolean
  readonly tab: Section
  readonly chats: number
  readonly drafts: number
  readonly onTab: (tab: Section) => void
}) => (
  <TitleBar>
    <span className="text-sm font-semibold">Instagram</span>
    {connected && (
      <div className="flex items-center gap-0.5 pl-2">
        <Tab active={tab === "chats"} onSelect={() => onTab("chats")}>
          Chats <span className="text-muted-foreground tabular-nums">{chats}</span>
        </Tab>
        <Tab active={tab === "waiting"} onSelect={() => onTab("waiting")}>
          Waiting for your OK{" "}
          {drafts > 0 && <span className="text-amber-600 tabular-nums dark:text-amber-400">{drafts}</span>}
        </Tab>
        <Tab active={tab === "settings"} onSelect={() => onTab("settings")}>
          Settings
        </Tab>
      </div>
    )}
  </TitleBar>
)

const Inbox = ({
  agents,
  waitingOnly,
  chatId,
  onChanged
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly waitingOnly: boolean
  /** The chat to open first, such as one picked in the activity log. */
  readonly chatId: string | null
  readonly onChanged: () => void
}) => {
  const { chats, reload } = useInstagramChats(true)
  const rows: ReadonlyArray<ChatRow> = chats.map(({ username, lastCustomerAt, ...chat }) => ({
    ...chat,
    handle: username,
    via: null,
    answerUntil: answerUntil(lastCustomerAt)
  }))
  const shown = waitingOnly ? rows.filter((chat) => chat.drafts > 0) : rows
  const [selectedId, setSelectedId] = useState<string | null>(chatId)
  const selected = shown.find((chat) => chat.id === selectedId) ?? shown[0]

  return (
    <div className="flex min-h-0 flex-1">
      <ChatList
        chats={shown}
        selectedId={selected?.id ?? null}
        searchLabel="Name or username"
        empty={waitingOnly ? "Nothing waits for you." : "No chats yet. They appear when customers write in Direct."}
        onSelect={setSelectedId}
      />
      {selected === undefined ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {waitingOnly ? "Every reply is sent." : "Customers who write in Direct show up here."}
        </div>
      ) : (
        <Conversation
          key={selected.id}
          chat={selected}
          agents={agents}
          api={api}
          onChanged={() => {
            void reload()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export const InstagramScreen = ({
  agents,
  chatId = null
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly chatId?: string | null
}) => {
  const { status, error, refresh, saveSettings, check, disconnect, login } = useInstagram()
  const [tab, setTab] = useState<Section>("chats")
  const connected = status?.account != null
  const { chats, reload } = useInstagramChats(connected)

  if (status === null) return <Title connected={false} tab={tab} chats={0} drafts={0} onTab={setTab} />

  return (
    <>
      <Title connected={connected} tab={tab} chats={chats.length} drafts={status.drafts} onTab={setTab} />
      {!connected && (
        <InstagramConnectView
          agents={agents}
          status={status}
          error={error}
          onSave={saveSettings}
          onLogin={login}
          onCheck={() => void check()}
        />
      )}
      {connected && tab === "settings" && (
        <InstagramSettingsView
          agents={agents}
          status={status}
          error={error}
          onSave={saveSettings}
          onCheck={() => void check()}
          onDisconnect={() => void disconnect()}
        />
      )}
      {connected && tab !== "settings" && (
        <Inbox
          agents={agents}
          waitingOnly={tab === "waiting"}
          chatId={chatId}
          onChanged={() => {
            void reload()
            void refresh()
          }}
        />
      )}
    </>
  )
}
