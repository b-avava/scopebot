import { Building2, ChartColumn, Check, CircleUser, Package, ScrollText, SquareKanban, Users } from "lucide-react"
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
  readonly businessOpen: boolean
  readonly contactsOpen: boolean
  readonly dealsOpen: boolean
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
  readonly onOpenServices: () => void
  readonly onOpenWhatsApp: () => void
  readonly onOpenTelegram: () => void
  readonly onOpenInstagram: () => void
  readonly onOpenAccount: () => void
}

export const AppRail = ({
  hasTeam,
  businessOpen,
  contactsOpen,
  dealsOpen,
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
    {hasTeam && <RailButton label="Activity log" icon={ScrollText} />}
    {hasTeam && <RailButton label="Dashboard" icon={ChartColumn} />}
    <div className="mt-auto">
      <RailButton label="Account" icon={CircleUser} active={accountOpen} onSelect={onOpenAccount} />
    </div>
  </nav>
)
