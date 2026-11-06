import type { Agent } from "@scope-bot/domain"
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
import { Building2, ChartColumn, Check, Moon, Plus, ScrollText, Sun } from "lucide-react"
import type { ServerStatus, Theme } from "../../preload/bridge.ts"
import { AgentMenu } from "./AgentMenu.tsx"
import { Mascot } from "./Mascot.tsx"

interface AppSidebarProps {
  readonly team: ReadonlyArray<Agent>
  readonly activeId: string | null
  readonly hiring: boolean
  readonly businessOpen: boolean
  readonly server: ServerStatus | null
  readonly theme: Theme
  readonly onToggleTheme: () => void
  readonly onHire: () => void
  readonly onOpenBusiness: () => void
  readonly onOpenEmployee: (id: string) => void
  readonly onOpenSettings: (id: string) => void
  readonly onDeleteEmployee: (agent: Agent) => void
}

const serverLabel = (server: ServerStatus | null) => {
  if (server === null) return "Connecting"
  return server.state === "online" ? "Server online" : "Server offline"
}

export const AppSidebar = ({
  team,
  activeId,
  hiring,
  businessOpen,
  server,
  theme,
  onToggleTheme,
  onHire,
  onOpenBusiness,
  onOpenEmployee,
  onOpenSettings,
  onDeleteEmployee
}: AppSidebarProps) => (
  <AnimatedSidebar collapsible="none" ariaLabel="Main" panelClassName="bg-sidebar h-full">
    <AnimatedSidebarHeader className="window-drag flex h-12 shrink-0 flex-row items-center gap-2 px-4">
      <span className="text-[15px] font-semibold">Scope Bot</span>
    </AnimatedSidebarHeader>

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
              {team.map((employee) => (
                <AnimatedSidebarMenuItem key={employee.id}>
                  <AnimatedSidebarMenuButton
                    className="pr-11 text-[15px] font-medium"
                    icon={<Mascot size={40} shape={employee.shape} face={employee.face} color={employee.color} />}
                    isActive={employee.id === activeId}
                    onSelect={() => onOpenEmployee(employee.id)}
                  >
                    {employee.name}
                  </AnimatedSidebarMenuButton>
                  <AgentMenu
                    name={employee.name}
                    onSettings={() => onOpenSettings(employee.id)}
                    onDelete={() => onDeleteEmployee(employee)}
                  />
                </AnimatedSidebarMenuItem>
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
