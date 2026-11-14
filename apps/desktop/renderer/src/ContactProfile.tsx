import type { Contact } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { ArrowLeft, MessageCircle, Pencil, Phone, Plus, Send } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useCrm } from "./CrmContext.tsx"
import { Composer, ContactAvatar, OwnerBadge, Tab, TaskList, Timeline } from "./CrmParts.tsx"
import { dayLabel, money, stageOf, toContactDetails } from "./crmStats.ts"
import { type DealCreating, DealModal } from "./DealModal.tsx"
import { errorMessage } from "./hooks.ts"
import { LinkedAppointments } from "./LinkedAppointments.tsx"
import { TitleBar } from "./TitleBar.tsx"

const Heading = ({ children }: { readonly children: ReactNode }) => (
  <h3 className="text-[13px] font-medium text-muted-foreground">{children}</h3>
)

const Detail = ({ label, value }: { readonly label: string; readonly value: string }) =>
  value === "" ? null : (
    <div className="flex justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )

const Summary = ({ contact }: { readonly contact: Contact }) => {
  const { agents, summarizeContact } = useCrm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const owner = agents.find((agent) => agent.id === contact.ownerId)

  if (owner === undefined) return null

  const ask = async () => {
    setBusy(true)
    const result = await summarizeContact(contact.id)
    setBusy(false)
    setError(result.ok ? null : errorMessage(result.error))
  }

  return (
    <section aria-label={`What ${owner.name} knows`} className="flex gap-3.5 rounded-card bg-field p-4">
      <OwnerBadge agent={owner} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            What {owner.name} knows about {contact.name.split(" ")[0]}
          </h2>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void ask()}>
            {busy ? "Writing" : contact.summary === null ? "Ask" : "Update"}
          </Button>
        </div>
        <p className="text-sm leading-[21px]">
          {contact.summary?.text ?? `Ask ${owner.name} to write down what matters about this contact.`}
        </p>
        {contact.summary !== null && (
          <p className="text-xs text-muted-foreground">Written by a model · {dayLabel(contact.summary.updatedAt)}</p>
        )}
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

export const ContactProfile = ({
  contact,
  onBack,
  onOpen,
  onEdit
}: {
  readonly contact: Contact
  readonly onBack: () => void
  readonly onOpen: (id: string) => void
  readonly onEdit: () => void
}) => {
  const { agents, contacts, deals, pipelines, activities, currency, saveContact } = useCrm()
  const [filter, setFilter] = useState<"all" | "note" | "event">("all")
  const [creating, setCreating] = useState<DealCreating | null>(null)
  const pipeline = pipelines[0]
  const firstStage = pipeline?.stages.find((stage) => stage.kind === "open")

  const company = contacts.find((item) => item.id === contact.companyId)
  const colleagues = contacts.filter(
    (item) =>
      item.id !== contact.id &&
      (item.companyId === contact.id || (contact.companyId !== null && item.companyId === contact.companyId))
  )
  const people = new Set([
    contact.id,
    ...contacts.filter((item) => item.companyId === contact.id).map((item) => item.id)
  ])
  const ownDeals = deals.filter((deal) => deal.contactId !== null && people.has(deal.contactId))
  const open = ownDeals.filter((deal) => stageOf(deal, pipeline)?.kind === "open")
  const dealIds = new Set(ownDeals.map((deal) => deal.id))
  const own = activities.filter(
    (activity) =>
      (activity.contactId !== null && people.has(activity.contactId)) ||
      (activity.dealId !== null && dealIds.has(activity.dealId))
  )
  const tasks = own.filter((activity) => activity.kind === "task")
  const history = own.filter((activity) => activity.kind !== "task")
  const shown = filter === "all" ? history : history.filter((activity) => activity.kind === filter)

  const setConsent = (patch: Partial<Contact["consent"]>) =>
    void saveContact({ ...toContactDetails(contact), consent: { ...contact.consent, ...patch } }, contact.id)

  const channels = [
    { icon: Phone, value: contact.channels.phone },
    { icon: MessageCircle, value: contact.channels.whatsapp },
    { icon: Send, value: contact.channels.telegram }
  ].filter((channel) => channel.value !== "")

  return (
    <>
      <TitleBar>
        <button
          type="button"
          onClick={onBack}
          className="window-no-drag flex items-center gap-1.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
          Contacts
        </button>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="truncate text-sm font-semibold">{contact.name}</span>
        <div className="window-no-drag ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          {firstStage !== undefined && (
            <Button size="sm" onClick={() => setCreating({ stage: firstStage, contactId: contact.id })}>
              <Plus className="size-4" />
              New deal
            </Button>
          )}
        </div>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-r p-5">
          <div className="flex flex-col gap-3">
            <ContactAvatar contact={contact} size={64} />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{contact.name}</h1>
              <p className="text-sm text-muted-foreground">
                {[contact.role, company?.name].filter(Boolean).join(" at ") ||
                  (contact.kind === "company" ? "Company" : "")}
              </p>
            </div>
          </div>

          <section className="flex flex-col gap-2.5">
            <Heading>Channels</Heading>
            {channels.length === 0 && <p className="text-sm text-muted-foreground">No channels yet.</p>}
            {channels.map((channel) => (
              <p key={channel.value} className="flex items-center gap-2.5 text-sm">
                <channel.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{channel.value}</span>
              </p>
            ))}
          </section>

          {contact.kind === "person" && (
            <section className="flex flex-col gap-2.5">
              <Heading>Consent</Heading>
              <div className="flex items-center justify-between text-sm">
                Messaged first
                <Switch
                  ariaLabel="Agreed to be messaged first"
                  checked={contact.consent.messages}
                  onCheckedChange={(messages) => setConsent({ messages })}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                Marketing
                <Switch
                  ariaLabel="Agreed to marketing"
                  checked={contact.consent.marketing}
                  onCheckedChange={(marketing) => setConsent({ marketing })}
                />
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <Heading>Details</Heading>
            <Detail label="Owner" value={agents.find((agent) => agent.id === contact.ownerId)?.name ?? "You"} />
            <Detail label="Language" value={contact.language} />
            <Detail label="Best time" value={contact.bestTime} />
            <Detail label="Source" value={contact.source} />
            <Detail label="Added" value={dayLabel(contact.createdAt)} />
          </section>

          {contact.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <Summary contact={contact} />
          <Composer links={{ contactId: contact.id, dealId: null }} placeholder="Add a note" />
          <div className="flex items-center gap-1 border-b pb-2">
            <Tab active={filter === "all"} onSelect={() => setFilter("all")}>
              Everything {history.length}
            </Tab>
            <Tab active={filter === "note"} onSelect={() => setFilter("note")}>
              Notes {history.filter((item) => item.kind === "note").length}
            </Tab>
            <Tab active={filter === "event"} onSelect={() => setFilter("event")}>
              What happened {history.filter((item) => item.kind === "event").length}
            </Tab>
          </div>
          <Timeline items={shown} empty="Nothing here yet." />
        </main>

        <aside className="flex w-[320px] shrink-0 flex-col gap-5 overflow-y-auto border-l p-5">
          <LinkedAppointments contactId={contact.id} />
          <section className="flex flex-col gap-2">
            <Heading>
              Open deals{open.length > 0 && `, ${money(open.reduce((sum, deal) => sum + deal.amount, 0))} ${currency}`}
            </Heading>
            {open.length === 0 && <p className="text-sm text-muted-foreground">No open deals.</p>}
            {open.map((deal) => (
              <div key={deal.id} className="rounded-control bg-field px-3 py-2.5">
                <p className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{deal.title}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(deal.amount)}</span>
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {[stageOf(deal, pipeline)?.name, deal.closeDate === null ? "" : `closes ${dayLabel(deal.closeDate)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <Heading>Tasks</Heading>
            <TaskList tasks={tasks} empty="No tasks yet." />
          </section>

          {colleagues.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <Heading>{contact.kind === "company" ? "People" : `Also at ${company?.name ?? "this company"}`}</Heading>
              {colleagues.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => onOpen(person.id)}
                  className="flex items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ContactAvatar contact={person} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{person.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{person.role}</span>
                  </span>
                </button>
              ))}
            </section>
          )}
        </aside>
      </div>

      {pipeline !== undefined && (
        <DealModal
          creating={creating}
          pipeline={pipeline}
          onClose={() => setCreating(null)}
          onCreated={() => setCreating(null)}
        />
      )}
    </>
  )
}
