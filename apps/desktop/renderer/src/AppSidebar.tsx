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
import type { Agent } from "@scope-bot/domain"
import { Building2, ChartColumn, Check, Moon, Plus, ScrollText, Sun } from "lucide-react"
import type { ServerStatus, Theme } from "../../preload/bridge.ts"
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
  onOpenEmployee
}: AppSidebarProps) => (
  <AnimatedSidebar collapsible="none" ariaLabel="Main" panelClassName="bg-sidebar h-full">
    <AnimatedSidebarHeader className="window-drag flex h-12 shrink-0 flex-row items-center gap-2 px-4">
      <span className="text-sm font-semibold">Scope Bot</span>
    </AnimatedSidebarHeader>

    <AnimatedSidebarContent>
      <AnimatedSidebarGroup>
        <AnimatedSidebarGroupContent>
          <AnimatedSidebarMenu>
            <AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuButton
                icon={<Plus className="size-4" />}
                isActive={hiring}
                onSelect={onHire}
              >
                {team.length === 0 ? "Hire your first employee" : "Hire an employee"}
              </AnimatedSidebarMenuButton>
            </AnimatedSidebarMenuItem>
            <AnimatedSidebarMenuItem>
              <AnimatedSidebarMenuButton
                icon={<Building2 className="size-4" />}
                isActive={businessOpen}
                onSelect={onOpenBusiness}
              >
                Business
              </AnimatedSidebarMenuButton>
            </AnimatedSidebarMenuItem>
            {team.length > 0 && (
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton disabled icon={<Check className="size-4" />}>
                  Approvals
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}
            {team.length > 0 && (
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton disabled icon={<ScrollText className="size-4" />}>
                  Activity log
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}
            {team.length > 0 && (
              <AnimatedSidebarMenuItem>
                <AnimatedSidebarMenuButton disabled icon={<ChartColumn className="size-4" />}>
                  Dashboard
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}
          </AnimatedSidebarMenu>
        </AnimatedSidebarGroupContent>
      </AnimatedSidebarGroup>

      {team.length > 0
        ? (
          <AnimatedSidebarGroup>
            <AnimatedSidebarGroupLabel>Team</AnimatedSidebarGroupLabel>
            <AnimatedSidebarGroupContent>
              <AnimatedSidebarMenu>
                {team.map((employee) => (
                  <AnimatedSidebarMenuItem key={employee.id}>
                    <AnimatedSidebarMenuButton
                      icon={<Mascot size={20} shape={employee.shape} face={employee.face} color={employee.color} />}
                      isActive={employee.id === activeId}
                      onSelect={() => onOpenEmployee(employee.id)}
                    >
                      {employee.name}
                    </AnimatedSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ))}
              </AnimatedSidebarMenu>
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>
        )
        : (
          <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No employees yet
          </p>
        )}
    </AnimatedSidebarContent>

    <AnimatedSidebarFooter className="flex flex-row items-center justify-between gap-2 px-4 py-3">
      <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span
          className={`size-2 rounded-full ${server?.state === "online" ? "bg-foreground" : "bg-destructive"}`}
        />
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
