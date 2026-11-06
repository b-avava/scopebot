import type { Agent } from "@scope-bot/domain"
import { AnimatedSidebarInset, AnimatedSidebarProvider } from "@scope-bot/ui/components/motion/animated-sidebar.tsx"
import { useState } from "react"
import { AppSidebar } from "./AppSidebar.tsx"
import { BusinessScreen } from "./BusinessScreen.tsx"
import { ChatScreen } from "./ChatScreen.tsx"
import { DeleteAgentModal } from "./DeleteAgentModal.tsx"
import { HireScreen } from "./HireScreen.tsx"
import { errorMessage, useAgents, useServerStatus, useTheme } from "./hooks.ts"

type View =
  | { readonly screen: "hire" }
  | { readonly screen: "business" }
  | { readonly screen: "agent"; readonly id: string; readonly settings: boolean }

export const App = () => {
  const server = useServerStatus()
  const { theme, toggleTheme } = useTheme()
  const { agents, create, update, remove } = useAgents(server?.state === "online")
  const [view, setView] = useState<View>({ screen: "hire" })
  const [deleting, setDeleting] = useState<Agent | null>(null)

  const active = view.screen === "agent" ? agents.find((agent) => agent.id === view.id) : undefined

  return (
    <AnimatedSidebarProvider className="flex h-svh w-full overflow-hidden" style={{ "--sidebar-width": "300px" }}>
      <AppSidebar
        team={agents}
        activeId={active?.id ?? null}
        hiring={view.screen === "hire" || (view.screen === "agent" && active === undefined)}
        businessOpen={view.screen === "business"}
        server={server}
        theme={theme}
        onToggleTheme={toggleTheme}
        onHire={() => setView({ screen: "hire" })}
        onOpenBusiness={() => setView({ screen: "business" })}
        onOpenEmployee={(id) => setView({ screen: "agent", id, settings: false })}
        onOpenSettings={(id) => setView({ screen: "agent", id, settings: true })}
        onDeleteEmployee={setDeleting}
      />
      <AnimatedSidebarInset className="flex h-svh min-w-0 flex-1 flex-col">
        {view.screen === "business" && <BusinessScreen />}
        {view.screen !== "business" && active === undefined && (
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
            showSettings={view.screen === "agent" && view.settings}
            onToggleSettings={() =>
              setView({ screen: "agent", id: active.id, settings: !(view.screen === "agent" && view.settings) })
            }
            onSaveSettings={async (settings) => {
              const result = await update(active.id, settings)
              return result.ok ? null : errorMessage(result.error)
            }}
            onRemove={() => setDeleting(active)}
          />
        )}
      </AnimatedSidebarInset>
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
  )
}
