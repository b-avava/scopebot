import type { Agent } from "@scope-bot/domain"
import { useState } from "react"
import { type ChannelChatApi, ChatList, type ChatRow, Conversation } from "./ChannelChats.tsx"
import { TelegramLogo } from "./ChannelLogos.tsx"
import { Tab } from "./CrmParts.tsx"
import { BotSettingsView, ConnectView } from "./TelegramSetup.tsx"
import { TitleBar } from "./TitleBar.tsx"
import { useTelegram, useTelegramChats } from "./useTelegram.ts"

type Section = "chats" | "waiting" | "settings"

const api: ChannelChatApi = {
  logo: <TelegramLogo className="size-3.5 text-[#2AABEE]" />,
  hiddenHandle: "No username",
  composerHint: "Goes to Telegram the way the customer wrote, as you.",
  listMessages: (chatId) => window.scopeBot.listTelegramMessages(chatId),
  send: (chatId, text) => window.scopeBot.sendTelegram(chatId, text),
  sendDraft: (id, text) => window.scopeBot.sendTelegramDraft(id, text),
  discardDraft: (id) => window.scopeBot.discardTelegramDraft(id)
}

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
    <span className="text-sm font-semibold">Telegram</span>
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
  onChanged
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly waitingOnly: boolean
  readonly onChanged: () => void
}) => {
  const { chats, reload } = useTelegramChats(true)
  const rows: ReadonlyArray<ChatRow> = chats.map(({ username, via, ...chat }) => ({
    ...chat,
    handle: username,
    via: via === "business" ? "your chats" : null
  }))
  const shown = waitingOnly ? rows.filter((chat) => chat.drafts > 0) : rows
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = shown.find((chat) => chat.id === selectedId) ?? shown[0]

  return (
    <div className="flex min-h-0 flex-1">
      <ChatList
        chats={shown}
        selectedId={selected?.id ?? null}
        searchLabel="Name or username"
        empty={waitingOnly ? "Nothing waits for you." : "No chats yet. They appear when customers write."}
        onSelect={setSelectedId}
      />
      {selected === undefined ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {waitingOnly ? "Every reply is sent." : "Customers who write to the bot show up here."}
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

export const TelegramScreen = ({ agents }: { readonly agents: ReadonlyArray<Agent> }) => {
  const { status, error, refresh, saveSettings, connect, disconnect } = useTelegram()
  const [tab, setTab] = useState<Section>("chats")
  const connected = status?.bot != null
  const { chats, reload } = useTelegramChats(connected)

  if (status === null) return <Title connected={false} tab={tab} chats={0} drafts={0} onTab={setTab} />

  return (
    <>
      <Title connected={connected} tab={tab} chats={chats.length} drafts={status.drafts} onTab={setTab} />
      {!connected && (
        <ConnectView agents={agents} status={status} error={error} onSave={saveSettings} onConnect={connect} />
      )}
      {connected && tab === "settings" && (
        <BotSettingsView
          agents={agents}
          status={status}
          error={error}
          onSave={saveSettings}
          onDisconnect={() => void disconnect()}
        />
      )}
      {connected && tab !== "settings" && (
        <Inbox
          agents={agents}
          waitingOnly={tab === "waiting"}
          onChanged={() => {
            void reload()
            void refresh()
          }}
        />
      )}
    </>
  )
}
