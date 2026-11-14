import {
  Building2,
  CalendarDays,
  ChartColumn,
  Check,
  CircleUser,
  Package,
  ScrollText,
  SquareKanban,
  Users
} from "lucide-react"
import type { ComponentType } from "react"
import { InstagramLogo, TelegramLogo, WhatsAppLogo } from "./ChannelLogos.tsx"

interface RailButtonProps {
  readonly label: string
  readonly icon: ComponentType<{ readonly className?: string }>
  readonly active?: boolean
  /** Empty means the section is not available yet. */
  readonly onSelect?: () => void
  /** A count to show on the button. */
  readonly badge?: number
}

const RailButton = ({ label, icon: Icon, active = false, onSelect, badge = 0 }: RailButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-current={active ? "page" : undefined}
    title={label}
    disabled={onSelect === undefined}
    onClick={onSelect}
    className={`relative flex size-10 items-center justify-center rounded-control outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${
      active ? "bg-muted text-foreground" : "text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground"
    }`}
  >
    <Icon className="size-5" />
    {badge > 0 && (
      <span className="absolute top-1 right-0.5 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-neutral-950">
        {badge}
      </span>
    )}
  </button>
)

interface AppRailProps {
  readonly hasTeam: boolean
  /** Owners and admins supervise the employees, so only they get the activity log. */
  readonly canSupervise: boolean
  readonly activityOpen: boolean
  readonly onOpenActivity: () => void
  readonly businessOpen: boolean
  readonly contactsOpen: boolean
  readonly dealsOpen: boolean
  /** The calendar shows only when the business turned it on. */
  readonly calendarEnabled: boolean
  readonly calendarOpen: boolean
  /** Bookings by AI employees that wait for a person. */
  readonly calendarWaiting: number
  readonly servicesOpen: boolean
  readonly whatsappOpen: boolean
  /** Replies on WhatsApp that wait for a person. */
  readonly whatsappDrafts: number
  readonly telegramOpen: boolean
  readonly telegramDrafts: number
  readonly instagramOpen: boolean
  readonly instagramDrafts: number
  readonly accountOpen: boolean
  readonly pendingApprovals: number
  readonly onOpenBusiness: () => void
  readonly onOpenContacts: () => void
  readonly onOpenDeals: () => void
  readonly onOpenCalendar: () => void
  readonly onOpenServices: () => void
  readonly onOpenWhatsApp: () => void
  readonly onOpenTelegram: () => void
  readonly onOpenInstagram: () => void
  readonly onOpenAccount: () => void
}

export const AppRail = ({
  hasTeam,
  canSupervise,
  activityOpen,
  onOpenActivity,
  businessOpen,
  contactsOpen,
  dealsOpen,
  calendarEnabled,
  calendarOpen,
  calendarWaiting,
  servicesOpen,
  whatsappOpen,
  whatsappDrafts,
  telegramOpen,
  telegramDrafts,
  instagramOpen,
  instagramDrafts,
  accountOpen,
  pendingApprovals,
  onOpenBusiness,
  onOpenContacts,
  onOpenDeals,
  onOpenCalendar,
  onOpenServices,
  onOpenWhatsApp,
  onOpenTelegram,
  onOpenInstagram,
  onOpenAccount
}: AppRailProps) => (
  <nav aria-label="Sections" className="flex w-14 shrink-0 flex-col items-center gap-1 pt-1 pb-2">
    <RailButton label="Business" icon={Building2} active={businessOpen} onSelect={onOpenBusiness} />
    <RailButton label="Contacts" icon={Users} active={contactsOpen} onSelect={onOpenContacts} />
    <RailButton label="Deals" icon={SquareKanban} active={dealsOpen} onSelect={onOpenDeals} />
    {calendarEnabled && (
      <RailButton
        label="Calendar"
        icon={CalendarDays}
        active={calendarOpen}
        onSelect={onOpenCalendar}
        badge={calendarWaiting}
      />
    )}
    <RailButton label="Services" icon={Package} active={servicesOpen} onSelect={onOpenServices} />
    <RailButton
      label="WhatsApp"
      icon={WhatsAppLogo}
      active={whatsappOpen}
      onSelect={onOpenWhatsApp}
      badge={whatsappDrafts}
    />
    <RailButton
      label="Telegram"
      icon={TelegramLogo}
      active={telegramOpen}
      onSelect={onOpenTelegram}
      badge={telegramDrafts}
    />
    <RailButton
      label="Instagram"
      icon={InstagramLogo}
      active={instagramOpen}
      onSelect={onOpenInstagram}
      badge={instagramDrafts}
    />
    {hasTeam && <RailButton label="Approvals" icon={Check} badge={pendingApprovals} />}
    {hasTeam && canSupervise && (
      <RailButton label="Activity log" icon={ScrollText} active={activityOpen} onSelect={onOpenActivity} />
    )}
    {hasTeam && <RailButton label="Dashboard" icon={ChartColumn} />}
    <div className="mt-auto">
      <RailButton label="Account" icon={CircleUser} active={accountOpen} onSelect={onOpenAccount} />
    </div>
  </nav>
)
