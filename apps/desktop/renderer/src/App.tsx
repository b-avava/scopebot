import type { Account, Agent, SearchHit } from "@scope-bot/domain"
import { AnimatedSidebarInset, AnimatedSidebarProvider } from "@scope-bot/ui/components/motion/animated-sidebar.tsx"
import { useCallback, useEffect, useState } from "react"
import { AccountScreen } from "./AccountScreen.tsx"
import { AppRail } from "./AppRail.tsx"
import { AppSidebar } from "./AppSidebar.tsx"
import { AuthScreen } from "./AuthScreen.tsx"
import { AgentStates } from "./Avatar.tsx"
import { BusinessScreen } from "./BusinessScreen.tsx"
import { ChatScreen } from "./ChatScreen.tsx"
import { ContactsScreen } from "./ContactsScreen.tsx"
import { CrmProvider, useCrm } from "./CrmContext.tsx"
import { DealsScreen } from "./DealsScreen.tsx"
import { DeleteAgentModal } from "./DeleteAgentModal.tsx"
import { type DepartmentEditing, DepartmentModal } from "./DepartmentModal.tsx"
import { HireScreen } from "./HireScreen.tsx"
import { errorMessage, useAgents, useDepartments, useServerStatus, useSession, useTheme } from "./hooks.ts"
import { ModelsProvider } from "./ModelsContext.tsx"
import { ProvidersScreen } from "./ProvidersScreen.tsx"
import { SearchPalette } from "./SearchPalette.tsx"
import { ServicesScreen } from "./ServicesScreen.tsx"
import { TelegramScreen } from "./TelegramScreen.tsx"
import { AppFrame } from "./TitleBar.tsx"
import { useTelegramDrafts } from "./useTelegram.ts"
import { useWhatsAppDrafts } from "./useWhatsApp.ts"
import { WhatsAppScreen } from "./WhatsAppScreen.tsx"

type View =
  | { readonly screen: "hire" }
  | { readonly screen: "business" }
  | { readonly screen: "contacts" }
  | { readonly screen: "deals" }
  | { readonly screen: "services" }
  | { readonly screen: "whatsapp" }
  | { readonly screen: "telegram" }
  | { readonly screen: "account" }
  | { readonly screen: "providers" }
  | { readonly screen: "agent"; readonly id: string; readonly settings: boolean; readonly target?: SearchHit }

/** The left rail needs the count of waiting approvals, which lives in the CRM data. */
const Rail = ({
  view,
  hasTeam,
  online,
  onOpen
}: {
  readonly view: View
  readonly hasTeam: boolean
  readonly online: boolean
  readonly onOpen: (
    screen: "business" | "contacts" | "deals" | "services" | "whatsapp" | "telegram" | "account"
  ) => void
}) => {
  const { approvals } = useCrm()
  const whatsappDrafts = useWhatsAppDrafts(online)
  const telegramDrafts = useTelegramDrafts(online)

  return (
    <AppRail
      hasTeam={hasTeam}
      businessOpen={view.screen === "business"}
      contactsOpen={view.screen === "contacts"}
      dealsOpen={view.screen === "deals"}
      servicesOpen={view.screen === "services"}
      whatsappOpen={view.screen === "whatsapp"}
      whatsappDrafts={whatsappDrafts}
      telegramOpen={view.screen === "telegram"}
      telegramDrafts={telegramDrafts}
      accountOpen={view.screen === "account"}
      pendingApprovals={approvals.filter((approval) => approval.status === "pending").length}
      onOpenBusiness={() => onOpen("business")}
      onOpenContacts={() => onOpen("contacts")}
      onOpenDeals={() => onOpen("deals")}
      onOpenServices={() => onOpen("services")}
      onOpenWhatsApp={() => onOpen("whatsapp")}
      onOpenTelegram={() => onOpen("telegram")}
      onOpenAccount={() => onOpen("account")}
    />
  )
}

/** The screens that need nothing from the team list around them. */
const SectionScreen = ({
  view,
  account,
  agents,
  onSignOut
}: {
  readonly view: View
  readonly account: Account
  readonly agents: ReadonlyArray<Agent>
  readonly onSignOut: () => void
}) => {
  if (view.screen === "business") return <BusinessScreen />
  if (view.screen === "contacts") return <ContactsScreen />
  if (view.screen === "deals") return <DealsScreen />
  if (view.screen === "services") return <ServicesScreen />
  if (view.screen === "whatsapp") return <WhatsAppScreen agents={agents} />
  if (view.screen === "telegram") return <TelegramScreen agents={agents} />
  if (view.screen === "account") return <AccountScreen account={account} onSignOut={onSignOut} />
  return view.screen === "providers" ? <ProvidersScreen agents={agents} /> : null
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

  const active = view.screen === "agent" ? agents.find((agent) => agent.id === view.id) : undefined

  return (
    <AgentStates.Provider value={states}>
      <ModelsProvider online={online} onOpenProviders={openProviders}>
        <CrmProvider online={online} agents={agents}>
          <AppFrame>
            <Rail view={view} hasTeam={agents.length > 0} online={online} onOpen={(screen) => setView({ screen })} />
            <AnimatedSidebarProvider
              className="mr-0.5 mb-0.5 min-h-0 flex-1 overflow-hidden rounded-xl border bg-background"
              style={{ "--sidebar-width": "300px" }}
            >
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
              <AnimatedSidebarInset className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                <SectionScreen view={view} account={account} agents={agents} onSignOut={onSignOut} />
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
