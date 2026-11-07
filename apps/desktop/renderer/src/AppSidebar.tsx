import type { Agent, LastMessage } from "@scope-bot/domain"
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem
} from "@scope-bot/ui/components/motion/animated-sidebar.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Building2, ChartColumn, Check, Moon, Pin, Plus, ScrollText, Search, Sun } from "lucide-react"
import { useCallback, useState } from "react"
import type { ServerStatus, Theme } from "../../preload/bridge.ts"
import { AgentMenu, type MenuPoint } from "./AgentMenu.tsx"
import { Mascot } from "./Mascot.tsx"
import { messageTime } from "./messageTime.ts"

interface AppSidebarProps {
  readonly team: ReadonlyArray<Agent>
  readonly lastMessages: ReadonlyArray<LastMessage>
  readonly activeId: string | null
  readonly hiring: boolean
  readonly businessOpen: boolean
  readonly server: ServerStatus | null
  readonly theme: Theme
  readonly onToggleTheme: () => void
  readonly onHire: () => void
  readonly onOpenBusiness: () => void
  readonly onSearch: () => void
  readonly onPinEmployee: (agent: Agent) => void
  readonly onOpenEmployee: (id: string) => void
  readonly onOpenSettings: (id: string) => void
  readonly onDeleteEmployee: (agent: Agent) => void
}

interface TeamRowProps {
  readonly employee: Agent
  readonly lastMessage: LastMessage | undefined
  readonly active: boolean
  readonly onOpen: () => void
  readonly onPin: () => void
  readonly onSettings: () => void
  readonly onDelete: () => void
}

const TeamRow = ({ employee, lastMessage, active, onOpen, onPin, onSettings, onDelete }: TeamRowProps) => {
  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null)
  const closeMenu = useCallback(() => setMenuAt(null), [])

  return (
    <AnimatedSidebarMenuItem
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuAt({ x: event.clientX, y: event.clientY })
      }}
    >
      <AnimatedSidebarMenuButton
        className="text-[15px] font-medium"
        icon={<Mascot size={40} shape={employee.shape} face={employee.face} color={employee.color} />}
        isActive={active}
        onSelect={onOpen}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{employee.name}</span>
          {employee.pinned && <Pin aria-label="Pinned" className="size-3.5 shrink-0 text-muted-foreground" />}
          {lastMessage !== undefined && (
            <time
              dateTime={lastMessage.createdAt}
              className="ml-auto shrink-0 text-xs font-normal tabular-nums text-muted-foreground"
            >
              {messageTime(lastMessage.createdAt, new Date())}
            </time>
          )}
        </span>
        <span className="block truncate text-[13px] font-normal leading-[18px] text-muted-foreground">
          {lastMessage?.text ?? employee.job}
        </span>
      </AnimatedSidebarMenuButton>
      {menuAt !== null && (
        <AgentMenu
          name={employee.name}
          pinned={employee.pinned}
          at={menuAt}
          onClose={closeMenu}
          onPin={onPin}
          onSettings={onSettings}
          onDelete={onDelete}
        />
      )}
    </AnimatedSidebarMenuItem>
  )
}

const serverLabel = (server: ServerStatus | null) => {
  if (server === null) return "Connecting"
  return server.state === "online" ? "Server online" : "Server offline"
}

export const AppSidebar = ({
  team,
  lastMessages,
  activeId,
  hiring,
  businessOpen,
  server,
  theme,
  onToggleTheme,
  onHire,
  onOpenBusiness,
  onSearch,
  onPinEmployee,
  onOpenEmployee,
  onOpenSettings,
  onDeleteEmployee
}: AppSidebarProps) => (
  <AnimatedSidebar collapsible="none" ariaLabel="Main" panelClassName="bg-sidebar h-full">
    <AnimatedSidebarHeader className="window-drag flex h-12 shrink-0 flex-row items-center gap-2 px-4">
      <span className="text-[15px] font-semibold">Scope Bot</span>
    </AnimatedSidebarHeader>

    <div className="px-3 pb-1">
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-2.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="size-4" />
        Search
        <kbd className="ml-auto font-sans text-[11px]">Ctrl K</kbd>
      </button>
    </div>

    <AnimatedSidebarContent>
      <AnimatedSidebarGroup>
        <AnimatedSidebarGroupContent>
          <AnimatedSidebarMenu className="[--sidebar-row:2.75rem]">
            <AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuButton
                className="text-[15px]"
                icon={<Plus className="size-5" />}
                isActive={hiring}
                onSelect={onHire}
              >
                {team.length === 0 ? "Hire your first employee" : "Hire an employee"}
              </AnimatedSidebarMenuButton>
            </AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuButton
                className="text-[15px]"
                icon={<Building2 className="size-5" />}
                isActive={businessOpen}
                onSelect={onOpenBusiness}
              >
                Business
              </AnimatedSidebarMenuButton>
            </AnimatedSidebarMenuItem>
            {team.length > 0 && (
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton disabled className="text-[15px]" icon={<Check className="size-5" />}>
                  Approvals
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}
            {team.length > 0 && (
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton disabled className="text-[15px]" icon={<ScrollText className="size-5" />}>
                  Activity log
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}
            {team.length > 0 && (
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton disabled className="text-[15px]" icon={<ChartColumn className="size-5" />}>
                  Dashboard
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}
          </AnimatedSidebarMenu>
        </AnimatedSidebarGroupContent>
      </AnimatedSidebarGroup>

      {team.length > 0 ? (
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupLabel>Team</AnimatedSidebarGroupLabel>
          <AnimatedSidebarGroupContent>
            <AnimatedSidebarMenu className="[--sidebar-icon:2.5rem] [--sidebar-row:3.5rem]">
              {[...team]
                .sort((first, second) => Number(second.pinned) - Number(first.pinned))
                .map((employee) => (
                  <TeamRow
                    key={employee.id}
                    employee={employee}
                    lastMessage={lastMessages.find((message) => message.agentId === employee.id)}
                    active={employee.id === activeId}
                    onOpen={() => onOpenEmployee(employee.id)}
                    onPin={() => onPinEmployee(employee)}
                    onSettings={() => onOpenSettings(employee.id)}
                    onDelete={() => onDeleteEmployee(employee)}
                  />
                ))}
            </AnimatedSidebarMenu>
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>
      ) : (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No employees yet</p>
      )}
    </AnimatedSidebarContent>

    <AnimatedSidebarFooter className="flex flex-row items-center justify-between gap-2 px-4 py-3">
      <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className={`size-2 rounded-full ${server?.state === "online" ? "bg-foreground" : "bg-destructive"}`} />
        {serverLabel(server)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={onToggleTheme}
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </AnimatedSidebarFooter>
  </AnimatedSidebar>
)
