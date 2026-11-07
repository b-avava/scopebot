import type { Agent, SearchHit } from "@scope-bot/domain"
import { AnimatedSidebarInset, AnimatedSidebarProvider } from "@scope-bot/ui/components/motion/animated-sidebar.tsx"
import { useCallback, useEffect, useState } from "react"
import { AppSidebar } from "./AppSidebar.tsx"
import { BusinessScreen } from "./BusinessScreen.tsx"
import { ChatScreen } from "./ChatScreen.tsx"
import { DeleteAgentModal } from "./DeleteAgentModal.tsx"
import { HireScreen } from "./HireScreen.tsx"
import { errorMessage, useAgents, useServerStatus, useTheme } from "./hooks.ts"
import { ModelsProvider } from "./ModelsContext.tsx"
import { ProvidersScreen } from "./ProvidersScreen.tsx"
import { SearchPalette } from "./SearchPalette.tsx"

type View =
  | { readonly screen: "hire" }
  | { readonly screen: "business" }
  | { readonly screen: "providers" }
  | { readonly screen: "agent"; readonly id: string; readonly settings: boolean; readonly target?: SearchHit }

export const App = () => {
  const server = useServerStatus()
  const { theme, toggleTheme } = useTheme()
  const { agents, lastMessages, reloadLastMessages, create, update, pin, remove } = useAgents(
    server?.state === "online"
  )
  const [view, setView] = useState<View>({ screen: "hire" })
  const [deleting, setDeleting] = useState<Agent | null>(null)

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
    <ModelsProvider online={server?.state === "online"} onOpenProviders={openProviders}>
      <AnimatedSidebarProvider className="flex h-svh w-full overflow-hidden" style={{ "--sidebar-width": "300px" }}>
        <AppSidebar
          team={agents}
          lastMessages={lastMessages}
          activeId={active?.id ?? null}
          hiring={view.screen === "hire" || (view.screen === "agent" && active === undefined)}
          businessOpen={view.screen === "business"}
          server={server}
          theme={theme}
          onToggleTheme={toggleTheme}
          onHire={() => setView({ screen: "hire" })}
          onOpenBusiness={() => setView({ screen: "business" })}
          onSearch={() => setSearching(true)}
          onPinEmployee={(agent) => void pin(agent.id, !agent.pinned)}
          onOpenEmployee={(id) => setView({ screen: "agent", id, settings: false })}
          onOpenSettings={(id) => setView({ screen: "agent", id, settings: true })}
          onDeleteEmployee={setDeleting}
        />
        <AnimatedSidebarInset className="flex h-svh min-w-0 flex-1 flex-col">
          {view.screen === "business" && <BusinessScreen />}
          {view.screen === "providers" && <ProvidersScreen agents={agents} />}
          {view.screen !== "business" && view.screen !== "providers" && active === undefined && (
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
    </ModelsProvider>
  )
}
