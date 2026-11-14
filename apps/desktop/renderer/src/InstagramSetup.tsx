import type { Agent, ChannelSettings, InstagramStatus } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { Clock, Globe, MessageCircle, ShieldCheck } from "lucide-react"
import { type ReactNode, useState } from "react"
import { InstagramMark } from "./ChannelLogos.tsx"
import { dateTime, Header, Page, Problem, SettingsFields, Stat } from "./WhatsAppSetup.tsx"

const Dot = ({ tone }: { readonly tone: "good" | "wait" | "off" }) => (
  <span
    className={`size-2 shrink-0 rounded-full ${
      tone === "good" ? "bg-[#3CBF6E]" : tone === "wait" ? "bg-amber-500 dark:bg-amber-400" : "bg-muted-foreground"
    }`}
  />
)

const Step = ({
  number,
  title,
  warn = false,
  aside,
  children
}: {
  readonly number: number
  readonly title: string
  readonly warn?: boolean
  readonly aside?: ReactNode
  readonly children: ReactNode
}) => (
  <section
    aria-label={title}
    className={`flex flex-col gap-3 rounded-card border px-5 py-[18px] ${
      warn ? "border-amber-400 bg-amber-400/5" : "bg-field"
    }`}
  >
    <div className="flex items-center gap-2.5">
      <span
        className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          warn ? "bg-amber-400 text-neutral-950" : "bg-foreground text-background"
        }`}
      >
        {number}
      </span>
      <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
      {aside}
    </div>
    <div className="flex flex-col gap-2.5 pl-8 text-[13px] leading-[19px]">{children}</div>
  </section>
)

/** Whether Instagram can send new messages here, and how to make it so. */
const ReachStep = ({ status, onCheck }: { readonly status: InstagramStatus; readonly onCheck: () => void }) => {
  const ready = status.configured && status.reachable === true
  const label = !status.configured ? "Not set up" : status.reachable === true ? "Reachable" : "Not reachable"
  return (
    <Step
      number={2}
      title="Instagram has to reach Scope Bot"
      warn={!ready}
      aside={
        <span
          className={`flex items-center gap-1.5 text-[13px] font-medium ${ready ? "" : "text-amber-600 dark:text-amber-400"}`}
        >
          <Dot tone={ready ? "good" : "wait"} />
          {label}
        </span>
      }
    >
      <p>
        Instagram sends new messages to a public address, unlike WhatsApp and Telegram.{" "}
        {status.configured
          ? "This server has one; it has to answer from the internet."
          : "This server has no Meta app and public address yet. Whoever runs it sets INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_VERIFY_TOKEN and PUBLIC_URL."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status.configured && (
          <button
            type="button"
            onClick={onCheck}
            className="h-8 rounded-control-sm border px-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Check again
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          Public address of this server: {status.publicUrl ?? "not set"}
        </span>
      </div>
    </Step>
  )
}

const WindowNote = () => (
  <div className="flex items-center gap-3 rounded-card border border-dashed px-4 py-3.5">
    <Clock className="size-[18px] shrink-0" />
    <div className="flex flex-col gap-0.5">
      <p className="text-sm font-medium">Answers within 24 hours</p>
      <p className="text-[13px] text-muted-foreground">
        Instagram lets a business answer for a day after the customer's last message. After that only a person can
        answer, for up to a week.
      </p>
    </div>
  </div>
)

/** Not connected: the account, the address, the same settings as every channel, and signing in. */
export const InstagramConnectView = ({
  agents,
  status,
  error,
  onSave,
  onLogin,
  onCheck
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly status: InstagramStatus
  readonly error: string | null
  readonly onSave: (settings: ChannelSettings) => Promise<boolean>
  readonly onLogin: () => Promise<boolean>
  readonly onCheck: () => void
}) => {
  const [settings, setSettings] = useState(status.settings)
  const [waiting, setWaiting] = useState(false)
  const chosen = agents.find((agent) => agent.id === settings.agentId)?.name
  const ready = status.configured && status.reachable === true

  const login = async () => {
    if (!(await onSave(settings))) return
    setWaiting(await onLogin())
  }

  return (
    <Page>
      <Header
        title="Instagram"
        hint="Customers write to your Instagram in Direct, and an employee answers."
        mark={<InstagramMark />}
      />
      <Step number={1} title="Prepare the Instagram account">
        <p>
          It is a <b>professional account</b>, Business or Creator. A personal one can switch in Settings, Account type
          and tools.
        </p>
        <p>
          Connected tools may read messages: <b>Settings</b>, <b>Messages and story replies</b>, <b>Message controls</b>
          , turn on <b>Allow access to messages</b>.
        </p>
      </Step>
      <ReachStep status={status} onCheck={onCheck} />
      <SettingsFields agents={agents} settings={settings} onChange={setSettings} scope="in Direct" />
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
      <WindowNote />
      <Problem text={error ?? status.problem} />
      <div className="flex items-center gap-4">
        <Button className="h-11" disabled={!ready || settings.agentId === null} onClick={() => void login()}>
          Continue with Instagram
        </Button>
        <span className="text-[13px] text-muted-foreground">
          {!ready
            ? "Available once Instagram can reach Scope Bot."
            : waiting
              ? "Finish in the browser. This page updates by itself."
              : "Instagram asks you to sign in and allow messages."}
        </span>
      </div>
    </Page>
  )
}

const Row = ({
  icon,
  title,
  detail,
  good
}: {
  readonly icon: ReactNode
  readonly title: string
  readonly detail: string
  readonly good: boolean
}) => (
  <div className="flex items-center gap-3 px-4 py-3.5">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-control-sm bg-muted">{icon}</span>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-sm font-medium">{title}</span>
      <span className="text-[13px] text-muted-foreground">{detail}</span>
    </div>
    <span className="flex items-center gap-1.5 text-[13px] font-medium">
      <Dot tone={good ? "good" : "wait"} />
      {good ? "Connected" : "Check it"}
    </span>
  </div>
)

/** Connected: the account, where messages come from, the settings and disconnecting. */
export const InstagramSettingsView = ({
  agents,
  status,
  error,
  onSave,
  onCheck,
  onDisconnect
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly status: InstagramStatus
  readonly error: string | null
  readonly onSave: (settings: ChannelSettings) => Promise<boolean>
  readonly onCheck: () => void
  readonly onDisconnect: () => void
}) => {
  const name = agents.find((agent) => agent.id === status.settings.agentId)?.name ?? "The employee"
  const save = (settings: ChannelSettings) => void onSave(settings)
  const [disconnecting, setDisconnecting] = useState(false)
  const online = status.reachable === true && status.problem === null

  return (
    <Page>
      <Header
        title="Instagram"
        hint={[
          `@${status.account?.username ?? ""}`,
          status.connectedAt === null ? null : `Connected ${dateTime(status.connectedAt)}`
        ]
          .filter((part) => part !== null)
          .join(" · ")}
        mark={<InstagramMark />}
      />
      <div className="flex rounded-card border">
        <div className="flex flex-1 flex-col gap-1 border-r px-4 py-3.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <Dot tone={online ? "good" : "off"} />
            {online ? "Online" : "Offline"}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {online ? "Messages arrive now" : "Instagram cannot reach this server"}
          </span>
        </div>
        <Stat value={`${status.chatsToday} ${status.chatsToday === 1 ? "chat" : "chats"}`} label="Today" />
        <Stat
          value={`${status.drafts} ${status.drafts === 1 ? "draft" : "drafts"}`}
          label="Wait for your OK"
          tone={status.drafts > 0 ? "text-amber-600 dark:text-amber-400" : ""}
        />
      </div>
      <div className="flex flex-col divide-y rounded-card border">
        <Row
          icon={<MessageCircle className="size-4" />}
          title="Direct messages"
          detail="Messages and replies to your stories arrive here"
          good={status.problem === null}
        />
        <Row
          icon={<Globe className="size-4" />}
          title="Public address"
          detail={`${status.publicUrl ?? "Not set"} · Instagram sends new messages here`}
          good={status.reachable === true}
        />
      </div>
      {status.reachable !== true && (
        <button
          type="button"
          onClick={onCheck}
          className="self-start rounded-sm text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Check the address again
        </button>
      )}
      <SettingsFields agents={agents} settings={status.settings} onChange={save} scope="in Direct" />
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
        {disconnecting ? (
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-destructive text-white hover:bg-destructive" onClick={onDisconnect}>
              Disconnect now
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDisconnecting(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDisconnecting(true)}
            className="self-start rounded-sm text-sm font-semibold text-destructive outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Disconnect Instagram
          </button>
        )}
        <p className="text-[13px] text-muted-foreground">
          {name} stops answering. Chats and contacts stay in Scope Bot. To take away the access too, remove Scope Bot in
          Instagram, Settings, Apps and websites.
        </p>
      </div>
    </Page>
  )
}
