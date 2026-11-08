import type { Agent, Department, LastMessage } from "@scope-bot/domain"
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem
} from "@scope-bot/ui/components/motion/animated-sidebar.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Bot, FolderPlus, Moon, Pencil, Pin, Plus, Search, Sun, Trash2 } from "lucide-react"
import { useCallback, useState } from "react"
import type { ServerStatus, Theme } from "../../preload/bridge.ts"
import { AgentMenu } from "./AgentMenu.tsx"
import { EmployeeAvatar } from "./Avatar.tsx"
import { Menu, type MenuPoint } from "./Menu.tsx"
import { messageTime } from "./messageTime.ts"

interface AppSidebarProps {
  readonly team: ReadonlyArray<Agent>
  readonly departments: ReadonlyArray<Department>
  readonly lastMessages: ReadonlyArray<LastMessage>
  readonly activeId: string | null
  readonly server: ServerStatus | null
  readonly theme: Theme
  readonly onToggleTheme: () => void
  readonly onHire: () => void
  readonly onAddDepartment: () => void
  readonly onRenameDepartment: (department: Department) => void
  readonly onDeleteDepartment: (department: Department) => void
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
        icon={<EmployeeAvatar agent={employee} size={40} greet />}
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

/** The plus next to search. */
const AddButton = ({ onHire, onAddDepartment }: Pick<AppSidebarProps, "onHire" | "onAddDepartment">) => {
  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null)
  const closeMenu = useCallback(() => setMenuAt(null), [])

  return (
    <>
      <button
        type="button"
        aria-label="Add"
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        title="Add"
        // The open menu closes on any press outside it, which would reopen it on click.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenuAt(menuAt === null ? { x: box.left, y: box.bottom + 4 } : null)
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-control-sm border bg-field text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4" />
      </button>
      {menuAt !== null && (
        <Menu
          label="Add"
          at={menuAt}
          onClose={closeMenu}
          items={[
            { label: "Hire an employee", icon: Bot, onSelect: onHire },
            { label: "Add a department", icon: FolderPlus, onSelect: onAddDepartment }
          ]}
        />
      )}
    </>
  )
}

type TeamActions = Pick<
  AppSidebarProps,
  "lastMessages" | "activeId" | "onPinEmployee" | "onOpenEmployee" | "onOpenSettings" | "onDeleteEmployee"
>

const TeamRows = ({
  team,
  lastMessages,
  activeId,
  onPinEmployee,
  onOpenEmployee,
  onOpenSettings,
  onDeleteEmployee
}: TeamActions & { readonly team: ReadonlyArray<Agent> }) => (
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
)

const DepartmentGroup = ({
  department,
  team,
  onRename,
  onDelete,
  ...actions
}: TeamActions & {
  readonly department: Department
  readonly team: ReadonlyArray<Agent>
  readonly onRename: () => void
  readonly onDelete: () => void
}) => {
  const [menuAt, setMenuAt] = useState<MenuPoint | null>(null)
  const closeMenu = useCallback(() => setMenuAt(null), [])

  return (
    <AnimatedSidebarGroup>
      <AnimatedSidebarGroupLabel
        onContextMenu={(event) => {
          event.preventDefault()
          setMenuAt({ x: event.clientX, y: event.clientY })
        }}
      >
        {department.name}
      </AnimatedSidebarGroupLabel>
      <AnimatedSidebarGroupContent>
        {team.length === 0 ? (
          <p className="px-2 pb-1 text-[13px] text-muted-foreground">No employees yet</p>
        ) : (
          <TeamRows team={team} {...actions} />
        )}
      </AnimatedSidebarGroupContent>
      {menuAt !== null && (
        <Menu
          label={`Actions for ${department.name}`}
          at={menuAt}
          onClose={closeMenu}
          items={[
            { label: "Rename", icon: Pencil, onSelect: onRename },
            { label: "Delete", icon: Trash2, danger: true, onSelect: onDelete }
          ]}
        />
      )}
    </AnimatedSidebarGroup>
  )
}

const serverLabel = (server: ServerStatus | null) => {
  if (server === null) return "Connecting"
  return server.state === "online" ? "Server online" : "Server offline"
}

export const AppSidebar = ({
  team,
  departments,
  lastMessages,
  activeId,
  server,
  theme,
  onToggleTheme,
  onHire,
  onAddDepartment,
  onRenameDepartment,
  onDeleteDepartment,
  onSearch,
  onPinEmployee,
  onOpenEmployee,
  onOpenSettings,
  onDeleteEmployee
}: AppSidebarProps) => {
  const actions = { lastMessages, activeId, onPinEmployee, onOpenEmployee, onOpenSettings, onDeleteEmployee }
  const sorted = [...departments].sort((first, second) => first.name.localeCompare(second.name))
  // An employee whose department just went away still has to show up somewhere.
  const general = team.filter((employee) => !departments.some((item) => item.id === employee.departmentId))

  return (
    <AnimatedSidebar collapsible="none" ariaLabel="Main" panelClassName="bg-background h-full">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control-sm border bg-field px-2.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="size-4" />
          Search
          <kbd className="ml-auto font-sans text-[11px]">Ctrl K</kbd>
        </button>
        <AddButton onHire={onHire} onAddDepartment={onAddDepartment} />
      </div>

      <AnimatedSidebarContent>
        {general.length > 0 && (
          <AnimatedSidebarGroup>
            <AnimatedSidebarGroupLabel>Team</AnimatedSidebarGroupLabel>
            <AnimatedSidebarGroupContent>
              <TeamRows team={general} {...actions} />
            </AnimatedSidebarGroupContent>
          </AnimatedSidebarGroup>
        )}
        {sorted.map((department) => (
          <DepartmentGroup
            key={department.id}
            department={department}
            team={team.filter((employee) => employee.departmentId === department.id)}
            onRename={() => onRenameDepartment(department)}
            onDelete={() => onDeleteDepartment(department)}
            {...actions}
          />
        ))}
        {team.length === 0 && departments.length === 0 && (
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
}
