import type { Agent } from "@scope-bot/domain"
import { useState } from "react"
import { type ChannelChatApi, ChatList, type ChatRow, Conversation } from "./ChannelChats.tsx"
import { WhatsAppLogo } from "./ChannelLogos.tsx"
import { Tab } from "./CrmParts.tsx"
import { TitleBar } from "./TitleBar.tsx"
import { useWhatsApp, useWhatsAppChats } from "./useWhatsApp.ts"
import { LinkingView, SettingsView, SetupView } from "./WhatsAppSetup.tsx"

type Section = "chats" | "waiting" | "settings"

const api: ChannelChatApi = {
  logo: <WhatsAppLogo className="size-3.5 text-[#25D366]" />,
  hiddenHandle: "Number hidden by WhatsApp",
  composerHint: "Goes straight to WhatsApp from the linked number, as you.",
  listMessages: (chatId) => window.scopeBot.listWhatsAppMessages(chatId),
  send: (chatId, text) => window.scopeBot.sendWhatsApp(chatId, text),
  sendDraft: (id, text) => window.scopeBot.sendWhatsAppDraft(id, text),
  discardDraft: (id) => window.scopeBot.discardWhatsAppDraft(id)
}

const Title = ({
  linked,
  tab,
  chats,
  drafts,
  onTab
}: {
  readonly linked: boolean
  readonly tab: Section
  readonly chats: number
  readonly drafts: number
  readonly onTab: (tab: Section) => void
}) => (
  <TitleBar>
    <span className="text-sm font-semibold">WhatsApp</span>
    {linked && (
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

/** Chats with customers on the linked number. The ones with a draft are first in Waiting. */
const Inbox = ({
  agents,
  waitingOnly,
  onChanged
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly waitingOnly: boolean
  readonly onChanged: () => void
}) => {
  const { chats, reload } = useWhatsAppChats(true)
  const rows: ReadonlyArray<ChatRow> = chats.map(({ phone, ...chat }) => ({ ...chat, handle: phone, via: null }))
  const shown = waitingOnly ? rows.filter((chat) => chat.drafts > 0) : rows
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = shown.find((chat) => chat.id === selectedId) ?? shown[0]

  return (
    <div className="flex min-h-0 flex-1">
      <ChatList
        chats={shown}
        selectedId={selected?.id ?? null}
        searchLabel="Name or number"
        empty={waitingOnly ? "Nothing waits for you." : "No chats yet. They appear when customers write."}
        onSelect={setSelectedId}
      />
      {selected === undefined ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {waitingOnly ? "Every reply is sent." : "Customers who write to the number show up here."}
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

export const WhatsAppScreen = ({ agents }: { readonly agents: ReadonlyArray<Agent> }) => {
  const { status, error, refresh, saveSettings, link, cancel, unlink } = useWhatsApp()
  const [tab, setTab] = useState<Section>("chats")
  const { chats, reload } = useWhatsAppChats(status?.state === "linked")

  if (status === null) return <Title linked={false} tab={tab} chats={0} drafts={0} onTab={setTab} />

  const agentName = agents.find((agent) => agent.id === status.settings.agentId)?.name ?? "the employee"
  const linked = status.state === "linked"

  return (
    <>
      <Title linked={linked} tab={tab} chats={chats.length} drafts={status.drafts} onTab={setTab} />
      {status.state === "unlinked" && (
        <SetupView agents={agents} status={status} error={error} onSave={saveSettings} onLink={link} />
      )}
      {status.state === "linking" && (
        <LinkingView status={status} agentName={agentName} error={error} onCancel={() => void cancel()} />
      )}
      {linked && tab === "settings" && (
        <SettingsView
          agents={agents}
          status={status}
          error={error}
          onSave={saveSettings}
          onUnlink={() => void unlink()}
        />
      )}
      {linked && tab !== "settings" && (
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
