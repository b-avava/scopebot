import { AnimatedSidebarInset, AnimatedSidebarProvider } from "@scope-bot/ui/components/motion/animated-sidebar.tsx"
import { useState } from "react"
import { AppSidebar } from "./AppSidebar.tsx"
import { BusinessScreen } from "./BusinessScreen.tsx"
import { ChatScreen } from "./ChatScreen.tsx"
import { HireScreen } from "./HireScreen.tsx"
import { errorMessage, useAgents, useServerStatus, useTheme } from "./hooks.ts"

type View =
  | { readonly screen: "hire" }
  | { readonly screen: "business" }
  | { readonly screen: "agent"; readonly id: string }

export const App = () => {
  const server = useServerStatus()
  const { theme, toggleTheme } = useTheme()
  const { agents, create, update, remove } = useAgents(server?.state === "online")
  const [view, setView] = useState<View>({ screen: "hire" })

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
        onOpenEmployee={(id) => setView({ screen: "agent", id })}
      />
      <AnimatedSidebarInset className="flex h-svh min-w-0 flex-1 flex-col">
        {view.screen === "business" && <BusinessScreen />}
        {view.screen !== "business" && active === undefined && (
          <HireScreen
            onHire={async (input) => {
              const result = await create(input)
              if (!result.ok) return errorMessage(result.error)
              setView({ screen: "agent", id: result.value.id })
              return null
            }}
          />
        )}
        {active !== undefined && (
          <ChatScreen
            key={active.id}
            agent={active}
            onSaveSettings={async (settings) => {
              const result = await update(active.id, settings)
              return result.ok ? null : errorMessage(result.error)
            }}
            onRemove={async () => {
              const result = await remove(active.id)
              if (!result.ok) return errorMessage(result.error)
              setView({ screen: "hire" })
              return null
            }}
          />
        )}
      </AnimatedSidebarInset>
    </AnimatedSidebarProvider>
  )
}
