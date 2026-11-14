import type { Account, ActivityChat, Agent, Channel, SearchHit } from "@scope-bot/domain"
import { AnimatedSidebarInset, AnimatedSidebarProvider } from "@scope-bot/ui/components/motion/animated-sidebar.tsx"
import { useCallback, useEffect, useState } from "react"
import { AccountScreen } from "./AccountScreen.tsx"
import { ActivityScreen } from "./ActivityScreen.tsx"
import { AppRail } from "./AppRail.tsx"
import { AppSidebar } from "./AppSidebar.tsx"
import { AuthScreen } from "./AuthScreen.tsx"
import { AgentStates } from "./Avatar.tsx"
import { BusinessScreen } from "./BusinessScreen.tsx"
import { CalendarProvider, useCalendar } from "./CalendarContext.tsx"
import { CalendarScreen } from "./CalendarScreen.tsx"
import { ChatScreen } from "./ChatScreen.tsx"
import { ContactsScreen } from "./ContactsScreen.tsx"
import { CrmProvider, useCrm } from "./CrmContext.tsx"
import { DealsScreen } from "./DealsScreen.tsx"
import { DeleteAgentModal } from "./DeleteAgentModal.tsx"
import { type DepartmentEditing, DepartmentModal } from "./DepartmentModal.tsx"
import { HireScreen } from "./HireScreen.tsx"
import { errorMessage, useAgents, useDepartments, useServerStatus, useSession, useTheme } from "./hooks.ts"
import { InstagramScreen } from "./InstagramScreen.tsx"
import { ModelsProvider } from "./ModelsContext.tsx"
import { ProvidersScreen } from "./ProvidersScreen.tsx"
import { SearchPalette } from "./SearchPalette.tsx"
import { ServicesScreen } from "./ServicesScreen.tsx"
import { TelegramScreen } from "./TelegramScreen.tsx"
import { AppFrame } from "./TitleBar.tsx"
import { useInstagramDrafts } from "./useInstagram.ts"
import { useTelegramDrafts } from "./useTelegram.ts"
import { useWhatsAppDrafts } from "./useWhatsApp.ts"
import { WhatsAppScreen } from "./WhatsAppScreen.tsx"

type View =
  | { readonly screen: "hire" }
  | { readonly screen: "business" }
  | { readonly screen: "contacts" }
  | { readonly screen: "deals" }
  | { readonly screen: "calendar"; readonly day?: string }
  | { readonly screen: "services" }
  | { readonly screen: "activity" }
  /** A chat can be picked to open first, as from the activity log. */
  | { readonly screen: Channel; readonly chatId?: string }
  | { readonly screen: "account" }
  | { readonly screen: "providers" }
  | {
      readonly screen: "agent"
      readonly id: string
      readonly settings: boolean
      readonly target?: SearchHit
      /** Asked from the calendar, sent as soon as the chat opens. */
      readonly question?: string
    }

/** Opens an in-app chat the way a search hit does. */
const chatTarget = (agentId: string, chat: ActivityChat): SearchHit => ({
  kind: "chat",
  agentId: agentId as SearchHit["agentId"],
  conversationId: chat.id,
  messageId: null,
  title: "",
  detail: ""
})

/** The left rail needs the count of waiting approvals, which lives in the CRM data. */
const Rail = ({
  view,
  hasTeam,
  canSupervise,
  online,
  onOpen
}: {
  readonly view: View
  readonly hasTeam: boolean
  readonly canSupervise: boolean
  readonly online: boolean
  readonly onOpen: (
    screen:
      | "business"
      | "contacts"
      | "deals"
      | "calendar"
      | "services"
      | "whatsapp"
      | "telegram"
      | "instagram"
      | "activity"
      | "account"
  ) => void
}) => {
  const { approvals } = useCrm()
  const calendar = useCalendar()
  const whatsappDrafts = useWhatsAppDrafts(online)
  const telegramDrafts = useTelegramDrafts(online)
  const instagramDrafts = useInstagramDrafts(online)

  return (
    <AppRail
      hasTeam={hasTeam}
      canSupervise={canSupervise}
      activityOpen={view.screen === "activity"}
      onOpenActivity={() => onOpen("activity")}
      businessOpen={view.screen === "business"}
      contactsOpen={view.screen === "contacts"}
      dealsOpen={view.screen === "deals"}
      calendarEnabled={calendar.settings.enabled}
      calendarOpen={view.screen === "calendar"}
      calendarWaiting={calendar.waiting.length}
      servicesOpen={view.screen === "services"}
      whatsappOpen={view.screen === "whatsapp"}
      whatsappDrafts={whatsappDrafts}
      telegramOpen={view.screen === "telegram"}
      telegramDrafts={telegramDrafts}
      instagramOpen={view.screen === "instagram"}
      instagramDrafts={instagramDrafts}
      accountOpen={view.screen === "account"}
      pendingApprovals={approvals.filter((approval) => approval.status === "pending").length}
      onOpenBusiness={() => onOpen("business")}
      onOpenContacts={() => onOpen("contacts")}
      onOpenDeals={() => onOpen("deals")}
      onOpenCalendar={() => onOpen("calendar")}
      onOpenServices={() => onOpen("services")}
      onOpenWhatsApp={() => onOpen("whatsapp")}
      onOpenTelegram={() => onOpen("telegram")}
      onOpenInstagram={() => onOpen("instagram")}
      onOpenAccount={() => onOpen("account")}
    />
  )
}

/** The screens that need nothing from the team list around them. */
const SectionScreen = ({
  view,
  account,
  agents,
  onSignOut,
  onAsk,
  onOpenChat
}: {
  readonly view: View
  readonly account: Account
  readonly agents: ReadonlyArray<Agent>
  readonly onSignOut: () => void
  readonly onAsk: (agentId: string, question: string) => void
  readonly onOpenChat: (agentId: string, chat: ActivityChat) => void
}) => {
  if (view.screen === "business") return <BusinessScreen />
  if (view.screen === "contacts") return <ContactsScreen />
  if (view.screen === "deals") return <DealsScreen />
  if (view.screen === "calendar") {
    return <CalendarScreen key={view.day} agents={agents} account={account} day={view.day ?? null} onAsk={onAsk} />
  }
  if (view.screen === "services") return <ServicesScreen />
  if (view.screen === "activity") return <ActivityScreen agents={agents} onOpenChat={onOpenChat} />
  if (view.screen === "whatsapp")
    return <WhatsAppScreen key={view.chatId} agents={agents} chatId={view.chatId ?? null} />
  if (view.screen === "telegram")
    return <TelegramScreen key={view.chatId} agents={agents} chatId={view.chatId ?? null} />
  if (view.screen === "instagram") {
    return <InstagramScreen key={view.chatId} agents={agents} chatId={view.chatId ?? null} />
  }
  if (view.screen === "account") return <AccountScreen account={account} onSignOut={onSignOut} />
  return view.screen === "providers" ? (
    <ProvidersScreen agents={agents} canManage={account.user.role !== "member"} />
  ) : null
}

const Workspace = ({ account, onSignOut }: { readonly account: Account; readonly onSignOut: () => void }) => {
  const server = useServerStatus()
  const online = server?.state === "online"
  const { theme, toggleTheme } = useTheme()
  const { agents, lastMessages, states, reload, reloadLastMessages, create, update, pin, remove } = useAgents(online)
  const departments = useDepartments(online)
  const [view, setView] = useState<View>({ screen: "hire" })
  const [deleting, setDeleting] = useState<Agent | null>(null)
  const [editingDepartment, setEditingDepartment] = useState<DepartmentEditing | null>(null)

  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearching((current) => !current)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const openProviders = useCallback(() => setView({ screen: "providers" }), [])
  const clearQuestion = useCallback(
    () => setView((current) => (current.screen === "agent" ? { ...current, question: undefined } : current)),
    []
  )

  const active = view.screen === "agent" ? agents.find((agent) => agent.id === view.id) : undefined

  return (
    <AgentStates.Provider value={states}>
      <ModelsProvider online={online} onOpenProviders={openProviders}>
        <CrmProvider online={online} agents={agents}>
          <CalendarProvider online={online}>
            <AppFrame>
              <Rail
                view={view}
                hasTeam={agents.length > 0}
                canSupervise={account.user.role !== "member"}
                online={online}
                onOpen={(screen) => setView({ screen })}
              />
              <AnimatedSidebarProvider
                className="mr-0.5 mb-0.5 min-h-0 flex-1 overflow-hidden rounded-xl border bg-background"
                style={{ "--sidebar-width": "300px" }}
              >
                {view.screen !== "calendar" && view.screen !== "activity" && (
                  <AppSidebar
                    team={agents}
                    departments={departments.departments}
                    lastMessages={lastMessages}
                    activeId={active?.id ?? null}
                    server={server}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onHire={() => setView({ screen: "hire" })}
                    onAddDepartment={() => setEditingDepartment({ action: "create" })}
                    onRenameDepartment={(department) => setEditingDepartment({ action: "rename", department })}
                    onDeleteDepartment={(department) => setEditingDepartment({ action: "delete", department })}
                    onSearch={() => setSearching(true)}
                    onPinEmployee={(agent) => void pin(agent.id, !agent.pinned)}
                    onOpenEmployee={(id) => setView({ screen: "agent", id, settings: false })}
                    onOpenSettings={(id) => setView({ screen: "agent", id, settings: true })}
                    onDeleteEmployee={setDeleting}
                  />
                )}
                <AnimatedSidebarInset className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                  <SectionScreen
                    view={view}
                    account={account}
                    agents={agents}
                    onSignOut={onSignOut}
                    onAsk={(id, question) => setView({ screen: "agent", id, settings: false, question })}
                    onOpenChat={(agentId, chat) =>
                      setView(
                        chat.channel === null
                          ? { screen: "agent", id: agentId, settings: false, target: chatTarget(agentId, chat) }
                          : { screen: chat.channel, chatId: chat.id }
                      )
                    }
                  />
                  {(view.screen === "hire" || (view.screen === "agent" && active === undefined)) && (
                    <HireScreen
                      onHire={async (input) => {
                        const result = await create(input)
                        if (!result.ok) return errorMessage(result.error)
                        setView({ screen: "agent", id: result.value.id, settings: false })
                        return null
                      }}
                    />
                  )}
                  {active !== undefined && (
                    <ChatScreen
                      key={active.id}
                      agent={active}
                      departments={departments.departments}
                      target={view.screen === "agent" ? (view.target ?? null) : null}
                      showSettings={view.screen === "agent" && view.settings}
                      canManageRules={account.user.role !== "member"}
                      onOpenCalendar={(day) => setView({ screen: "calendar", day })}
                      question={view.screen === "agent" ? (view.question ?? null) : null}
                      onAsked={clearQuestion}
                      onChatChanged={reloadLastMessages}
                      onCloseSettings={() => setView({ screen: "agent", id: active.id, settings: false })}
                      onOpenBusiness={() => setView({ screen: "business" })}
                      onSaveSettings={async (settings) => {
                        const result = await update(active.id, settings)
                        return result.ok ? null : errorMessage(result.error)
                      }}
                      onRemove={() => setDeleting(active)}
                    />
                  )}
                </AnimatedSidebarInset>
                {searching && (
                  <SearchPalette
                    team={agents}
                    onClose={() => setSearching(false)}
                    onOpen={(hit) => {
                      setSearching(false)
                      setView({ screen: "agent", id: hit.agentId, settings: false, target: hit })
                    }}
                  />
                )}
                <DepartmentModal
                  editing={editingDepartment}
                  onCancel={() => setEditingDepartment(null)}
                  onSave={async (name, department) => {
                    const result = await (department === null
                      ? departments.create({ name })
                      : departments.update(department.id, { name }))
                    if (!result.ok) return errorMessage(result.error)
                    setEditingDepartment(null)
                    return null
                  }}
                  onDelete={async (department) => {
                    const result = await departments.remove(department.id)
                    if (!result.ok) return errorMessage(result.error)
                    setEditingDepartment(null)
                    reload()
                    return null
                  }}
                />
                <DeleteAgentModal
                  agent={deleting}
                  onCancel={() => setDeleting(null)}
                  onConfirm={async (agent) => {
                    const result = await remove(agent.id)
                    if (!result.ok) return errorMessage(result.error)
                    setDeleting(null)
                    if (view.screen === "agent" && view.id === agent.id) setView({ screen: "hire" })
                    return null
                  }}
                />
              </AnimatedSidebarProvider>
            </AppFrame>
          </CalendarProvider>
        </CrmProvider>
      </ModelsProvider>
    </AgentStates.Provider>
  )
}

/** Nothing below loads until someone is signed in, so no screen ever runs without a session. */
export const App = () => {
  const { state, signedIn, signOut } = useSession()

  if (state.status === "loading") return null
  if (state.status === "signed-out") return <AuthScreen onSignedIn={signedIn} />

  return <Workspace key={state.account.user.id} account={state.account} onSignOut={() => void signOut()} />
}
