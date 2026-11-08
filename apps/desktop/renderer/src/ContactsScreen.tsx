import type { Contact } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { MessageCircle, Phone, Plus, Send } from "lucide-react"
import { useState } from "react"
import { type ContactEditing, ContactModal } from "./ContactModal.tsx"
import { ContactProfile } from "./ContactProfile.tsx"
import { useCrm } from "./CrmContext.tsx"
import { AttentionPill, ContactAvatar, FilterSelect, ownerOptions, SearchField, Tab } from "./CrmParts.tsx"
import { dayLabel, duplicateIds, money, stageOf, timeLabel } from "./crmStats.ts"
import { errorMessage } from "./hooks.ts"
import { TitleBar } from "./TitleBar.tsx"

const PAGE_SIZE = 20

type Segment = "all" | "person" | "company" | "no-consent" | "duplicates"

const ChannelIcons = ({ contact }: { readonly contact: Contact }) => {
  const dim = (value: string) => (value === "" ? "text-muted-foreground/40" : "text-foreground")
  return (
    <span className="flex gap-2.5">
      <Phone
        aria-label={contact.channels.phone === "" ? "No phone" : "Phone"}
        className={`size-4 ${dim(contact.channels.phone)}`}
      />
      <MessageCircle
        aria-label={contact.channels.whatsapp === "" ? "No WhatsApp" : "WhatsApp"}
        className={`size-4 ${dim(contact.channels.whatsapp)}`}
      />
      <Send
        aria-label={contact.channels.telegram === "" ? "No Telegram" : "Telegram"}
        className={`size-4 ${dim(contact.channels.telegram)}`}
      />
    </span>
  )
}

const consentText = ({ consent, kind }: Contact) => {
  if (kind === "company") return "Set per person"
  if (consent.messages && consent.marketing) return "Messages, marketing"
  if (consent.messages) return "Messages"
  return consent.marketing ? "Marketing" : "No consent yet"
}

const matchesSegment = (contact: Contact, segment: Segment, duplicates: ReadonlySet<string>) => {
  if (segment === "all") return true
  if (segment === "duplicates") return duplicates.has(contact.id)
  if (segment === "no-consent") return contact.kind === "person" && !contact.consent.messages
  return contact.kind === segment
}

const headerCell = "px-2 text-left text-xs font-medium text-muted-foreground"

const Table = ({ rows, onOpen }: { readonly rows: ReadonlyArray<Contact>; readonly onOpen: (id: string) => void }) => {
  const { agents, contacts, deals, pipelines, activities } = useCrm()
  const pipeline = pipelines[0]

  const lastTouch = (contact: Contact) => {
    const latest = activities
      .filter((activity) => activity.contactId === contact.id)
      .reduce<string | null>(
        (newest, item) => (newest === null || item.createdAt > newest ? item.createdAt : newest),
        null
      )
    return latest === null ? "Nothing yet" : `${dayLabel(latest)}, ${timeLabel(latest)}`
  }

  const openDeals = (contact: Contact) => {
    const people = contacts.filter((item) => item.id === contact.id || item.companyId === contact.id)
    return deals.filter(
      (deal) => people.some((item) => item.id === deal.contactId) && stageOf(deal, pipeline)?.kind === "open"
    )
  }

  return (
    <table className="w-full min-w-[1000px] border-collapse">
      <thead className="sticky top-0 z-10 bg-field">
        <tr className="h-9 border-b">
          <th scope="col" className={`${headerCell} pl-4`}>
            Name
          </th>
          <th scope="col" className={headerCell}>
            Channels
          </th>
          <th scope="col" className={headerCell}>
            Owner
          </th>
          <th scope="col" className={headerCell}>
            Last activity
          </th>
          <th scope="col" className={headerCell}>
            Open deals
          </th>
          <th scope="col" className={headerCell}>
            Consent
          </th>
          <th scope="col" className={`${headerCell} pr-4`}>
            Tags
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((contact) => {
          const open = openDeals(contact)
          const company = contacts.find((item) => item.id === contact.companyId)
          const noConsent = contact.kind === "person" && !contact.consent.messages && !contact.consent.marketing
          return (
            <tr
              key={contact.id}
              onClick={() => onOpen(contact.id)}
              className="h-[60px] cursor-pointer border-b transition-colors duration-150 hover:bg-muted"
            >
              <td className="pl-4">
                <span className="flex items-center gap-3">
                  <ContactAvatar contact={contact} />
                  <span className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(contact.id)}
                      className="block truncate text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {contact.name}
                    </button>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {[contact.role, company?.name].filter(Boolean).join(", ") ||
                        (contact.kind === "company" ? "Company" : "")}
                    </span>
                  </span>
                </span>
              </td>
              <td className="px-2">
                <ChannelIcons contact={contact} />
              </td>
              <td className="px-2 text-[13px]">
                {agents.find((agent) => agent.id === contact.ownerId)?.name ?? "You"}
              </td>
              <td className="px-2 text-[13px] text-muted-foreground">{lastTouch(contact)}</td>
              <td className="px-2 text-[13px] text-muted-foreground">
                {open.length > 0 && (
                  <>
                    <span className="font-semibold tabular-nums text-foreground">
                      {money(open.reduce((sum, deal) => sum + deal.amount, 0))}
                    </span>{" "}
                    in {open.length}
                  </>
                )}
              </td>
              <td className={`px-2 text-[13px] ${noConsent ? "text-destructive" : "text-muted-foreground"}`}>
                {consentText(contact)}
              </td>
              <td className="px-2 pr-4 text-[13px] text-muted-foreground">{contact.tags.join(", ")}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export const ContactsScreen = () => {
  const { contacts, agents, loaded, failure, online, saveContact, removeContact } = useCrm()
  const [editing, setEditing] = useState<ContactEditing | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [segment, setSegment] = useState<Segment>("all")
  const [search, setSearch] = useState("")
  const [owner, setOwner] = useState("all")
  const [channel, setChannel] = useState("any")
  const [tag, setTag] = useState("any")
  const [page, setPage] = useState(0)

  const problem = online ? failure : "offline"
  const open = contacts.find((contact) => contact.id === openId)
  const duplicates = duplicateIds(contacts)
  const tags = [...new Set(contacts.flatMap((contact) => contact.tags))].sort()
  const needle = search.trim().toLowerCase()

  const rows = contacts
    .filter(
      (contact) =>
        matchesSegment(contact, segment, duplicates) &&
        (owner === "all" || (contact.ownerId ?? "you") === owner) &&
        (channel === "any" || contact.channels[channel as keyof Contact["channels"]] !== "") &&
        (tag === "any" || contact.tags.includes(tag)) &&
        (needle === "" ||
          [contact.name, contact.role, ...Object.values(contact.channels), ...contact.tags]
            .join(" ")
            .toLowerCase()
            .includes(needle))
    )
    .sort((first, second) => first.name.localeCompare(second.name))

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const count = (kind: Segment) => contacts.filter((item) => matchesSegment(item, kind, duplicates)).length

  const modal = (
    <ContactModal
      editing={editing}
      onCancel={() => setEditing(null)}
      onSave={async (details, contact) => {
        const result = await saveContact(details, contact?.id ?? null)
        if (!result.ok) return errorMessage(result.error)
        setEditing(null)
        return null
      }}
      onDelete={async (contact) => {
        const result = await removeContact(contact.id)
        if (!result.ok) return errorMessage(result.error)
        setEditing(null)
        setOpenId(null)
        return null
      }}
    />
  )

  if (open !== undefined) {
    return (
      <>
        <ContactProfile
          contact={open}
          onBack={() => setOpenId(null)}
          onOpen={setOpenId}
          onEdit={() => setEditing({ contact: open })}
        />
        {modal}
      </>
    )
  }

  return (
    <>
      <TitleBar>
        <span className="text-sm font-semibold">Contacts</span>
        <div className="flex items-center gap-0.5 pl-2">
          <Tab active={segment === "all"} onSelect={() => setSegment("all")}>
            All {contacts.length}
          </Tab>
          <Tab active={segment === "person"} onSelect={() => setSegment("person")}>
            People {count("person")}
          </Tab>
          <Tab active={segment === "company"} onSelect={() => setSegment("company")}>
            Companies {count("company")}
          </Tab>
          <Tab active={segment === "no-consent"} onSelect={() => setSegment("no-consent")}>
            No consent {count("no-consent")}
          </Tab>
        </div>
        <div className="window-no-drag ml-auto">
          <Button size="sm" disabled={!online} onClick={() => setEditing({ contact: null })}>
            <Plus className="size-4" />
            New contact
          </Button>
        </div>
      </TitleBar>

      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <SearchField value={search} placeholder="Name, phone, company or tag" onChange={setSearch} />
        <FilterSelect
          label="Owner"
          value={owner}
          options={[{ value: "all", label: "Everyone" }, ...ownerOptions(agents)]}
          onChange={setOwner}
        />
        <FilterSelect
          label="Channel"
          value={channel}
          options={[
            { value: "any", label: "Any" },
            { value: "phone", label: "Phone" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "telegram", label: "Telegram" }
          ]}
          onChange={setChannel}
        />
        <FilterSelect
          label="Tag"
          value={tag}
          options={[{ value: "any", label: "Any" }, ...tags.map((value) => ({ value, label: value }))]}
          onChange={setTag}
        />
        {duplicates.size > 0 && (
          <div className="ml-auto">
            <AttentionPill onClick={() => setSegment(segment === "duplicates" ? "all" : "duplicates")}>
              {segment === "duplicates" ? "Show all contacts" : `${duplicates.size} possible duplicates`}
            </AttentionPill>
          </div>
        )}
      </div>

      {problem !== null && (
        <p role="alert" className="px-4 pb-3 text-sm text-destructive">
          {errorMessage(problem)}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto border-t">
        <Table rows={rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)} onOpen={setOpenId} />
        {problem === null && loaded && rows.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            {contacts.length === 0 ? "No contacts yet. Add the first one." : "No contacts match these filters."}
          </p>
        )}
      </div>

      <footer className="flex h-11 shrink-0 items-center justify-between border-t px-4 text-[13px] text-muted-foreground">
        <span>{rows.length} contacts</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Previous
          </button>
          Page {current + 1} of {pages}
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            Next
          </button>
        </span>
      </footer>

      {modal}
    </>
  )
}
