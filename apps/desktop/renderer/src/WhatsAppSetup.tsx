import type { Agent, WhatsAppAudience, WhatsAppSettings, WhatsAppStatus } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { QrCode, ShieldCheck, TriangleAlert } from "lucide-react"
import { type ReactNode, useState } from "react"
import { EmployeeAvatar } from "./Avatar.tsx"
import { WhatsAppMark } from "./ChannelLogos.tsx"

const labelClasses = "text-[13px] font-medium text-muted-foreground"
const hintClasses = "text-xs text-muted-foreground"

export const Page = ({ children }: { readonly children: ReactNode }) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6 px-6 pt-14 pb-10">{children}</div>
  </div>
)

export const Header = ({
  title,
  hint,
  mark = <WhatsAppMark />
}: {
  readonly title: string
  readonly hint: string
  readonly mark?: ReactNode
}) => (
  <div className="flex items-center gap-4">
    {mark}
    <div className="flex flex-col gap-1">
      <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  </div>
)

export const Problem = ({ text }: { readonly text: string | null }) =>
  text === null ? null : (
    <p role="alert" className="text-sm text-destructive">
      {text}
    </p>
  )

const RiskNote = () => (
  <div className="flex gap-3 rounded-card border border-amber-400 bg-amber-400/5 px-4 py-3.5">
    <TriangleAlert className="mt-px size-[18px] shrink-0 text-amber-600 dark:text-amber-400" />
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">An unofficial link</p>
      <p className="text-[13px] leading-[19px]">
        Scope Bot joins your WhatsApp as a linked device, the way WhatsApp Web does. WhatsApp can limit or block a
        number it thinks is automated, so use a number kept for Scope Bot, not your personal one.
      </p>
    </div>
  </div>
)

const audiences: ReadonlyArray<{ readonly value: WhatsAppAudience; readonly label: string }> = [
  { value: "everyone", label: "Everyone who writes" },
  { value: "contacts", label: "Only contacts in the CRM" }
]

/** Who answers and who gets answers: the same on the first screen and in Settings. */
export const SettingsFields = ({
  agents,
  settings,
  onChange,
  scope = "on this number"
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly settings: WhatsAppSettings
  readonly onChange: (settings: WhatsAppSettings) => void
  /** What every chat comes through, as in "every chat on this number". */
  readonly scope?: string
}) => {
  const chosen = agents.find((agent) => agent.id === settings.agentId)
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className={labelClasses}>Who answers</span>
        <label className="flex h-11 items-center gap-2.5 rounded-control border bg-field pl-3 focus-within:ring-2 focus-within:ring-ring">
          {chosen !== undefined && <EmployeeAvatar agent={chosen} size={24} />}
          <select
            aria-label="Who answers"
            value={settings.agentId ?? ""}
            onChange={(event) =>
              onChange({ ...settings, agentId: event.target.value === "" ? null : (event.target.value as Agent["id"]) })
            }
            className="h-full min-w-0 flex-1 bg-transparent pr-3 text-sm font-medium outline-none"
          >
            <option value="">Choose an employee</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · {agent.job}
              </option>
            ))}
          </select>
        </label>
        <span className={hintClasses}>
          Every chat {scope} goes to {chosen?.name ?? "this employee"}. You can read and answer any of them yourself.
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelClasses}>Who gets answers</span>
        <fieldset aria-label="Who gets answers" className="flex rounded-control bg-muted p-0.5">
          {audiences.map((option) => (
            <label
              key={option.value}
              className={`flex h-9 flex-1 cursor-pointer items-center justify-center rounded-control-sm text-[13px] font-medium transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-ring ${
                option.value === settings.audience ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <input
                type="radio"
                name="whatsapp-audience"
                checked={option.value === settings.audience}
                onChange={() => onChange({ ...settings, audience: option.value })}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <span className={hintClasses}>
          {settings.audience === "everyone"
            ? "A new sender becomes a contact. Group chats are never answered."
            : "Others still show up in Chats, and only a person answers them. Group chats are never answered."}
        </span>
      </div>
    </>
  )
}

/** Nothing is set up yet: the risk, the settings and the two ways to link. */
export const SetupView = ({
  agents,
  status,
  error,
  onSave,
  onLink
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly status: WhatsAppStatus
  readonly error: string | null
  readonly onSave: (settings: WhatsAppSettings) => Promise<boolean>
  readonly onLink: (phone: string | null) => Promise<boolean>
}) => {
  const [settings, setSettings] = useState(status.settings)
  const [phone, setPhone] = useState<string | null>(null)
  const chosen = agents.find((agent) => agent.id === settings.agentId)?.name

  const link = async () => {
    if (await onSave(settings)) await onLink(phone === null || phone.trim() === "" ? null : phone)
  }

  return (
    <Page>
      <Header title="WhatsApp" hint="Customers write to your number, and an employee answers for you." />
      <RiskNote />
      <SettingsFields agents={agents} settings={settings} onChange={setSettings} />
      <div className="flex items-center gap-3 rounded-card bg-field px-4 py-3.5">
        <ShieldCheck className="size-[18px] shrink-0" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Every reply waits for your OK</p>
          <p className="text-[13px] text-muted-foreground">
            {chosen ?? "The employee"} writes a draft, you send it, change it or throw it away. You can let{" "}
            {chosen ?? "the employee"} answer alone later.
          </p>
        </div>
      </div>
      {phone !== null && (
        <div className="flex flex-col gap-1.5">
          <Input
            label="Phone number with the country code"
            placeholder="+995 555 12 34 56"
            value={phone}
            onChange={setPhone}
            classNames={{ label: "px-0 text-[13px] text-muted-foreground" }}
          />
          <span className={hintClasses}>WhatsApp shows a code on the screen, and you type it on that phone.</span>
        </div>
      )}
      <Problem text={error ?? status.problem} />
      <div className="flex items-center gap-4">
        <Button className="h-11" disabled={settings.agentId === null} onClick={() => void link()}>
          {phone === null ? (
            <>
              <QrCode className="size-4" />
              Link with a QR code
            </>
          ) : (
            "Get a code"
          )}
        </Button>
        <button
          type="button"
          onClick={() => setPhone(phone === null ? "" : null)}
          className="rounded-sm text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {phone === null ? "Use a phone number instead" : "Use a QR code instead"}
        </button>
      </div>
    </Page>
  )
}

const QrPicture = ({ rows }: { readonly rows: ReadonlyArray<string> }) => (
  <svg
    viewBox={`0 0 ${rows.length} ${rows.length}`}
    shapeRendering="crispEdges"
    role="img"
    aria-label="QR code to link WhatsApp"
    className="size-[196px]"
  >
    <path
      fill="#0A0A0A"
      d={rows.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === "1" ? [`M${x} ${y}h1v1h-1z`] : []))).join("")}
    />
  </svg>
)

const Step = ({ number, children }: { readonly number: number; readonly children: ReactNode }) => (
  <li className="flex items-start gap-2.5">
    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
      {number}
    </span>
    <span className="text-sm leading-5">{children}</span>
  </li>
)

/** Waiting for the phone: the QR code, or the code to type. */
export const LinkingView = ({
  status,
  agentName,
  error,
  onCancel
}: {
  readonly status: WhatsAppStatus
  readonly agentName: string
  readonly error: string | null
  readonly onCancel: () => void
}) => {
  const usingCode = status.qr === null && status.pairingCode !== null
  return (
    <Page>
      <Header title="Link WhatsApp" hint={`Use the phone that has the number you want ${agentName} to answer on.`} />
      <div className="flex gap-8 rounded-card border bg-field p-6">
        <div className="flex shrink-0 flex-col items-center gap-2.5">
          <div className="flex size-[224px] items-center justify-center rounded-control bg-white p-3.5">
            {status.qr !== null && <QrPicture rows={status.qr} />}
            {usingCode && (
              <span className="font-mono text-[26px] font-semibold tracking-[0.12em] text-neutral-950">
                {status.pairingCode}
              </span>
            )}
            {status.qr === null && !usingCode && <span className="text-sm text-neutral-500">Getting a code…</span>}
          </div>
          <span className={hintClasses}>
            {usingCode ? "Type this on the phone" : "A new code comes every 20 seconds"}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 pt-1">
          <p className="text-[15px] font-semibold">On your phone</p>
          <ol className="flex flex-col gap-3.5">
            <Step number={1}>Open WhatsApp</Step>
            <Step number={2}>
              Go to <b>Settings</b>, then <b>Linked devices</b>
            </Step>
            <Step number={3}>
              {usingCode ? (
                <>
                  Tap <b>Link a device</b>, then <b>Link with phone number instead</b>, and type the code
                </>
              ) : (
                <>
                  Tap <b>Link a device</b> and point the phone at this code
                </>
              )}
            </Step>
          </ol>
          <p className="flex items-center gap-2 pt-1.5 text-[13px] text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
            Waiting for the phone
          </p>
        </div>
      </div>
      <Problem text={error ?? status.problem} />
      <div>
        <Button variant="outline" className="h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Page>
  )
}

export const Stat = ({
  value,
  label,
  tone
}: {
  readonly value: string
  readonly label: string
  readonly tone?: string
}) => (
  <div className="flex flex-1 flex-col gap-1 border-r px-4 py-3.5 last:border-r-0">
    <span className={`text-[15px] font-semibold ${tone ?? ""}`}>{value}</span>
    <span className="text-[13px] text-muted-foreground">{label}</span>
  </div>
)

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** The linked number: how it is doing, the same settings, and unlinking. */
export const SettingsView = ({
  agents,
  status,
  error,
  onSave,
  onUnlink
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly status: WhatsAppStatus
  readonly error: string | null
  readonly onSave: (settings: WhatsAppSettings) => Promise<boolean>
  readonly onUnlink: () => void
}) => {
  const name = agents.find((agent) => agent.id === status.settings.agentId)?.name ?? "The employee"
  const save = (settings: WhatsAppSettings) => void onSave(settings)
  const [unlinking, setUnlinking] = useState(false)

  return (
    <Page>
      <Header
        title="WhatsApp"
        hint={[status.phone, status.linkedAt === null ? null : `Linked ${dateTime(status.linkedAt)}`]
          .filter((part) => part !== null)
          .join(" · ")}
      />
      <div className="flex rounded-card border">
        <div className="flex flex-1 flex-col gap-1 border-r px-4 py-3.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span className={`size-2 rounded-full ${status.online ? "bg-[#3CBF6E]" : "bg-muted-foreground"}`} />
            {status.online ? "Online" : "Offline"}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {status.online ? "Messages arrive now" : "Connecting to WhatsApp"}
          </span>
        </div>
        <Stat value={`${status.chatsToday} ${status.chatsToday === 1 ? "chat" : "chats"}`} label="Today" />
        <Stat
          value={`${status.drafts} ${status.drafts === 1 ? "draft" : "drafts"}`}
          label="Wait for your OK"
          tone={status.drafts > 0 ? "text-amber-600 dark:text-amber-400" : ""}
        />
      </div>
      <SettingsFields agents={agents} settings={status.settings} onChange={save} />
      <div className="flex items-center gap-4 rounded-card bg-field px-4 py-3.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="text-sm font-medium">{name} answers alone</p>
          <p className="text-[13px] text-muted-foreground">
            {status.settings.answersAlone
              ? `On: ${name} sends replies right away, within the employee's permissions and limits.`
              : "Off: every reply is a draft that waits for your OK."}
          </p>
        </div>
        <Switch
          ariaLabel={`${name} answers alone`}
          checked={status.settings.answersAlone}
          onCheckedChange={(answersAlone) => save({ ...status.settings, answersAlone })}
        />
      </div>
      <Problem text={error ?? status.problem} />
      <div className="flex flex-col gap-1 border-t pt-5">
        {unlinking ? (
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-destructive text-white hover:bg-destructive" onClick={onUnlink}>
              Unlink now
            </Button>
            <Button size="sm" variant="outline" onClick={() => setUnlinking(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setUnlinking(true)}
            className="self-start rounded-sm text-sm font-semibold text-destructive outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Unlink this number
          </button>
        )}
        <p className="text-[13px] text-muted-foreground">
          {name} stops answering. Chats and contacts stay in Scope Bot, and the phone keeps working as before.
        </p>
      </div>
    </Page>
  )
}
