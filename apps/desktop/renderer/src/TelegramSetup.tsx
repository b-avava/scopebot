import type { Agent, ChannelSettings, TelegramStatus } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { Bot, Check, Copy, ShieldCheck, User } from "lucide-react"
import { type ReactNode, useState } from "react"
import { TelegramMark } from "./ChannelLogos.tsx"
import { dateTime, Header, Page, Problem, SettingsFields, Stat } from "./WhatsAppSetup.tsx"

const hintClasses = "text-xs text-muted-foreground"

const StepCard = ({
  number,
  title,
  optional = false,
  children
}: {
  readonly number: number
  readonly title: string
  readonly optional?: boolean
  readonly children: ReactNode
}) => (
  <section
    aria-label={title}
    className={`flex flex-col gap-3.5 rounded-card border px-5 py-[18px] ${optional ? "" : "bg-field"}`}
  >
    <div className="flex items-center gap-2.5">
      <span
        className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          optional ? "border-[1.5px] border-dashed text-muted-foreground" : "bg-foreground text-background"
        }`}
      >
        {number}
      </span>
      <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
      {optional && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Optional</span>
      )}
    </div>
    <div className="flex flex-col gap-3 pl-8">{children}</div>
  </section>
)

const BusinessSteps = () => (
  <p className="text-[13px] leading-[19px]">
    Customers who write to the business account, not to the bot, get answers too. It needs Telegram Premium on that
    account. In Telegram go to <b>Settings</b>, <b>Telegram Business</b>, <b>Chatbots</b>, and add the bot. Scope Bot
    notices it by itself.
  </p>
)

/** No bot yet: how to make one, the token, and the same settings as every channel. */
export const ConnectView = ({
  agents,
  status,
  error,
  onSave,
  onConnect
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly status: TelegramStatus
  readonly error: string | null
  readonly onSave: (settings: ChannelSettings) => Promise<boolean>
  readonly onConnect: (token: string) => Promise<boolean>
}) => {
  const [settings, setSettings] = useState(status.settings)
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const chosen = agents.find((agent) => agent.id === settings.agentId)?.name

  const connect = async () => {
    setBusy(true)
    if (await onSave(settings)) await onConnect(token.trim())
    setBusy(false)
  }

  return (
    <Page>
      <Header
        title="Telegram"
        hint="Customers write to your bot or your own Telegram, and an employee answers."
        mark={<TelegramMark />}
      />
      <StepCard number={1} title="Create a bot for the business">
        <p className="text-[13px] leading-[19px]">
          In Telegram, open <b>@BotFather</b>, send <b>/newbot</b>, pick a name such as your business and a username
          that ends in bot. BotFather answers with a token.
        </p>
        <div className="flex flex-col gap-1.5">
          <Input
            label="Bot token"
            placeholder="7012345678:AAH…"
            value={token}
            onChange={setToken}
            autoComplete="off"
            classNames={{ label: "px-0 text-[13px] font-medium text-muted-foreground" }}
          />
          <span className={hintClasses}>
            It stays on the server, encrypted. Anyone with it can write as the bot, so do not share it.
          </span>
        </div>
      </StepCard>
      <StepCard number={2} title="Answer in your own chats too" optional>
        <BusinessSteps />
      </StepCard>
      <SettingsFields agents={agents} settings={settings} onChange={setSettings} scope="with the bot" />
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
      <Problem text={error ?? status.problem} />
      <div className="flex items-center gap-4">
        <Button
          className="h-11"
          disabled={settings.agentId === null || token.trim() === "" || busy}
          onClick={() => void connect()}
        >
          Connect the bot
        </Button>
        <span className="text-[13px] text-muted-foreground">Scope Bot checks the token and shows the bot's name.</span>
      </div>
    </Page>
  )
}

const PlaceRow = ({
  icon,
  title,
  detail,
  children
}: {
  readonly icon: ReactNode
  readonly title: string
  readonly detail: ReactNode
  readonly children?: ReactNode
}) => (
  <div className="flex items-center gap-3 px-4 py-3.5">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-control-sm bg-muted">{icon}</span>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-sm font-medium">{title}</span>
      <span className="text-[13px] text-muted-foreground">{detail}</span>
    </div>
    {children}
  </div>
)

const CopyLink = ({ link }: { readonly link: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(link).then(() => setCopied(true))
      }}
      className="flex h-8 items-center gap-1.5 rounded-control-sm border px-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  )
}

/** Where customers can write: the bot always, the business account once its owner adds the bot. */
const Places = ({ status }: { readonly status: TelegramStatus }) => {
  const link = `t.me/${status.bot?.username ?? ""}`
  const account = status.business
  return (
    <div className="flex flex-col divide-y rounded-card border">
      <PlaceRow
        icon={<Bot className="size-4" />}
        title="The bot"
        detail={`${link} · put it on the website and in Instagram`}
      >
        <CopyLink link={`https://${link}`} />
      </PlaceRow>
      <PlaceRow
        icon={<User className="size-4" />}
        title="Your own chats"
        detail={
          account === null
            ? "Not connected. Add the bot in Telegram Business to answer there too."
            : [account.name, account.username === "" ? null : `@${account.username}`, "through Telegram Business"]
                .filter((part) => part !== null)
                .join(" · ")
        }
      >
        {account !== null && (
          <span className="flex items-center gap-1.5 text-[13px] font-medium">
            <span className={`size-2 rounded-full ${account.enabled ? "bg-[#3CBF6E]" : "bg-muted-foreground"}`} />
            {account.enabled ? "Connected" : "Turned off"}
          </span>
        )}
      </PlaceRow>
    </div>
  )
}

/** A connected bot: how it is doing, where customers write, the settings and disconnecting. */
export const BotSettingsView = ({
  agents,
  status,
  error,
  onSave,
  onDisconnect
}: {
  readonly agents: ReadonlyArray<Agent>
  readonly status: TelegramStatus
  readonly error: string | null
  readonly onSave: (settings: ChannelSettings) => Promise<boolean>
  readonly onDisconnect: () => void
}) => {
  const name = agents.find((agent) => agent.id === status.settings.agentId)?.name ?? "The employee"
  const save = (settings: ChannelSettings) => void onSave(settings)
  const [disconnecting, setDisconnecting] = useState(false)

  return (
    <Page>
      <Header
        title="Telegram"
        hint={[
          `@${status.bot?.username ?? ""}`,
          status.connectedAt === null ? null : `Connected ${dateTime(status.connectedAt)}`
        ]
          .filter((part) => part !== null)
          .join(" · ")}
        mark={<TelegramMark />}
      />
      <div className="flex rounded-card border">
        <div className="flex flex-1 flex-col gap-1 border-r px-4 py-3.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span className={`size-2 rounded-full ${status.online ? "bg-[#3CBF6E]" : "bg-muted-foreground"}`} />
            {status.online ? "Online" : "Offline"}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {status.online ? "Messages arrive now" : "Connecting to Telegram"}
          </span>
        </div>
        <Stat value={`${status.chatsToday} ${status.chatsToday === 1 ? "chat" : "chats"}`} label="Today" />
        <Stat
          value={`${status.drafts} ${status.drafts === 1 ? "draft" : "drafts"}`}
          label="Wait for your OK"
          tone={status.drafts > 0 ? "text-amber-600 dark:text-amber-400" : ""}
        />
      </div>
      <Places status={status} />
      {status.business === null && (
        <div className="rounded-card border border-dashed px-4 py-3.5">
          <BusinessSteps />
        </div>
      )}
      <SettingsFields
        agents={agents}
        settings={status.settings}
        onChange={save}
        scope={status.business === null ? "with the bot" : "with the bot and in your own chats"}
      />
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
            Disconnect the bot
          </button>
        )}
        <p className="text-[13px] text-muted-foreground">
          {name} stops answering. Chats and contacts stay in Scope Bot. The bot itself stays in Telegram until you
          delete it in @BotFather.
        </p>
      </div>
    </Page>
  )
}
