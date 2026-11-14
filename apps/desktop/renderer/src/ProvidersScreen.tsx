import type { Agent, ModelChoice, ProviderCatalog, ProviderId } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Switch } from "@scope-bot/ui/components/motion/switch.tsx"
import { ChevronLeft, ChevronRight, ChevronsUpDown, Search } from "lucide-react"
import { type ReactNode, useState } from "react"
import { errorMessage } from "./hooks.ts"
import { ProviderIcon } from "./ModelPicker.tsx"
import { useModels } from "./ModelsContext.tsx"
import { TitleBar } from "./TitleBar.tsx"
import { VoiceSettings } from "./VoiceSettings.tsx"

const statusLabels: Record<ProviderCatalog["status"], string> = {
  connected: "Connected",
  "signed-out": "Not connected",
  "not-installed": "Not installed",
  failed: "Not available"
}

const hasSignIn = (provider: ProviderCatalog) => provider.id === "claude-code" || provider.id === "codex"

const keyNames: Partial<Record<ProviderId, string>> = {
  "claude-code": "Claude",
  codex: "OpenAI"
}

const Card = ({ children }: { readonly children: ReactNode }) => (
  <div className="flex flex-col divide-y rounded-card border">{children}</div>
)

const Row = ({
  title,
  hint,
  children
}: {
  readonly title: string
  readonly hint?: string
  readonly children?: ReactNode
}) => (
  <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm font-medium">{title}</span>
      {hint !== undefined && hint !== "" && <span className="text-[13px] text-muted-foreground">{hint}</span>}
    </span>
    {children}
  </div>
)

const Section = ({
  title,
  hint,
  action,
  children
}: {
  readonly title: string
  readonly hint?: string
  readonly action?: ReactNode
  readonly children: ReactNode
}) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {hint !== undefined && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
)

const fieldClasses =
  "h-9 w-full rounded-control-sm border bg-field px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

const SearchField = ({
  label,
  value,
  onChange
}: {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}) => (
  <span className="relative block">
    <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
    <input
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${fieldClasses} pl-8`}
    />
  </span>
)

const AccountSection = ({ provider, usedBy }: { readonly provider: ProviderCatalog; readonly usedBy: string }) => {
  const { reload } = useModels()
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async () => {
    setWaiting(true)
    setError(null)
    const result = await window.scopeBot.loginProvider(provider.id)
    setWaiting(false)
    if (result.ok) reload()
    else setError(errorMessage(result.error))
  }

  const signedIn = provider.status === "connected" && !provider.hasKey
  const account = provider.account === "" ? `${provider.name} account` : provider.account

  return (
    <Section title="Account">
      <Card>
        {signedIn || provider.account !== "" ? (
          <Row title={account} hint={usedBy === "" ? "Signed in on this computer" : `Used by: ${usedBy}`} />
        ) : (
          <Row title="Not signed in" hint={error ?? provider.hint}>
            {provider.status !== "not-installed" && (
              <Button size="sm" variant="outline" disabled={waiting} onClick={() => void signIn()}>
                {waiting ? "Waiting for browser…" : "Sign in"}
              </Button>
            )}
          </Row>
        )}
      </Card>
    </Section>
  )
}

const KeySection = ({ provider }: { readonly provider: ProviderCatalog }) => {
  const { reload } = useModels()
  const [adding, setAdding] = useState(false)
  const [key, setKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  const needsUrl = provider.id === "custom"
  const ready = key.trim() !== "" && (!needsUrl || baseUrl.trim() !== "")
  const keyName = keyNames[provider.id] ?? provider.name

  const save = async () => {
    const result = await window.scopeBot.saveProviderKey(provider.id, {
      key: key.trim(),
      ...(needsUrl ? { baseUrl: baseUrl.trim() } : {})
    })
    setKey("")
    if (!result.ok) return setError(errorMessage(result.error))
    setAdding(false)
    setError(null)
    reload()
  }

  const remove = async () => {
    const result = await window.scopeBot.removeProviderKey(provider.id)
    if (result.ok) reload()
    else setError(errorMessage(result.error))
  }

  if (provider.id === "api") {
    return (
      <Section title="API key">
        <Card>
          <Row title="Key from .env" hint="Change it in .env and restart the server." />
        </Card>
      </Section>
    )
  }

  return (
    <Section title="API key">
      <Card>
        {provider.hasKey && (
          <Row title="Key saved" hint={error ?? "Kept on the server and never shown again."}>
            <Button size="sm" variant="outline" onClick={() => void remove()}>
              Remove key
            </Button>
          </Row>
        )}
        {!provider.hasKey && !adding && (
          <Row title="No key" hint={`Paste a ${keyName} API key.`}>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              Add key
            </Button>
          </Row>
        )}
        {!provider.hasKey && adding && (
          <div className="flex flex-col gap-2 p-3">
            {needsUrl && (
              <input
                aria-label="Address"
                placeholder="https://example.com/v1"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className={fieldClasses}
              />
            )}
            <input
              aria-label="API key"
              type="password"
              autoComplete="off"
              placeholder="API key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className={fieldClasses}
            />
            {error !== null && <p className="text-[13px] text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" disabled={!ready} onClick={() => void save()}>
                Save key
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Section>
  )
}

const ModelsSection = ({ provider }: { readonly provider: ProviderCatalog }) => {
  const { preferences, savePreferences } = useModels()
  const [search, setSearch] = useState("")

  const hiddenHere = preferences.hiddenModels.filter((item) => item.provider === provider.id)
  const others = preferences.hiddenModels.filter((item) => item.provider !== provider.id)
  const isHidden = (model: string) => hiddenHere.some((item) => item.model === model)
  const visible = provider.models.filter((model) => !isHidden(model.id)).length
  const shown = provider.models.filter((model) =>
    `${model.name} ${model.id}`.toLowerCase().includes(search.trim().toLowerCase())
  )

  const saveHidden = (next: ReadonlyArray<ModelChoice>) =>
    savePreferences({ ...preferences, hiddenModels: [...others, ...next] })

  const toggle = (model: string, show: boolean) =>
    saveHidden(
      show ? hiddenHere.filter((item) => item.model !== model) : [...hiddenHere, { provider: provider.id, model }]
    )

  const allHidden = visible === 0

  return (
    <Section
      title="Models"
      hint={`${visible} of ${provider.models.length} shown in the model picker.`}
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            saveHidden(allHidden ? [] : provider.models.map((model) => ({ provider: provider.id, model: model.id })))
          }
        >
          {allHidden ? "Show all" : "Hide all"}
        </Button>
      }
    >
      <SearchField label="Search models" value={search} onChange={setSearch} />
      <Card>
        {shown.map((model) => (
          <div key={model.id} className="flex min-h-10 items-center justify-between gap-4 px-4 py-1.5">
            <span className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="truncate">{model.name}</span>
              <code className="truncate text-xs text-muted-foreground">{model.id}</code>
            </span>
            <Switch
              ariaLabel={`Show ${model.name}`}
              checked={!isHidden(model.id)}
              onCheckedChange={(show) => toggle(model.id, show)}
            />
          </div>
        ))}
        {shown.length === 0 && <p className="p-4 text-[13px] text-muted-foreground">No models found</p>}
      </Card>
    </Section>
  )
}

const UseSection = ({ provider }: { readonly provider: ProviderCatalog }) => {
  const { preferences, savePreferences } = useModels()
  const enabled = !preferences.disabled.includes(provider.id)

  return (
    <Section title="Use">
      <Card>
        <Row title="Default for new agents" hint={`New agents start with ${provider.name}.`}>
          <Switch
            ariaLabel="Default for new agents"
            checked={preferences.defaultProvider === provider.id}
            onCheckedChange={(on) => savePreferences({ ...preferences, defaultProvider: on ? provider.id : null })}
          />
        </Row>
        <Row title={`Use ${provider.name}`} hint="When off, it leaves the model picker.">
          <Switch
            ariaLabel={`Use ${provider.name}`}
            checked={enabled}
            onCheckedChange={(on) =>
              savePreferences({
                ...preferences,
                disabled: on
                  ? preferences.disabled.filter((id) => id !== provider.id)
                  : [...preferences.disabled, provider.id]
              })
            }
          />
        </Row>
      </Card>
    </Section>
  )
}

const ProviderDetail = ({
  provider,
  agents
}: {
  readonly provider: ProviderCatalog
  readonly agents: ReadonlyArray<Agent>
}) => {
  const { preferences } = useModels()
  const users = agents.filter((agent) => agent.provider === provider.id)
  const summary = [
    preferences.defaultProvider === provider.id ? "Default for new agents" : "",
    `${users.length} ${users.length === 1 ? "agent uses" : "agents use"} it`
  ]
    .filter((part) => part !== "")
    .join(" · ")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl border">
          <ProviderIcon provider={provider.id} size={22} />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-base font-semibold">{provider.name}</span>
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${provider.status === "connected" ? "bg-foreground" : "bg-muted-foreground/50"}`}
              />
              {statusLabels[provider.status]}
            </span>
          </span>
          <span className="text-[13px] text-muted-foreground">{summary}</span>
        </span>
      </div>

      {provider.status === "failed" && <p className="text-[13px] text-destructive">{provider.hint}</p>}
      {hasSignIn(provider) && <AccountSection provider={provider} usedBy={users.map((user) => user.name).join(", ")} />}
      <KeySection provider={provider} />
      {hasSignIn(provider) && provider.detail !== "" && (
        <Section title="Runtime">
          <Card>
            <Row title="Version" hint={provider.detail} />
          </Card>
        </Section>
      )}
      {provider.models.length > 0 && <ModelsSection provider={provider} />}
      {provider.status === "connected" && <UseSection provider={provider} />}
    </div>
  )
}

const subtitle = (provider: ProviderCatalog) =>
  provider.status === "connected"
    ? provider.account || provider.detail
    : provider.status === "failed"
      ? provider.hint
      : statusLabels[provider.status]

const ProviderList = ({
  providers,
  onOpen
}: {
  readonly providers: ReadonlyArray<ProviderCatalog>
  readonly onOpen: (id: ProviderId) => void
}) => (
  <Card>
    {providers.map((provider) => (
      <button
        key={provider.id}
        type="button"
        onClick={() => onOpen(provider.id)}
        className="flex min-h-16 items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-150 first:rounded-t-card last:rounded-b-card hover:bg-muted focus-visible:bg-muted"
      >
        <span className="shrink-0">
          <ProviderIcon provider={provider.id} size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{provider.name}</span>
          <span className="truncate text-[13px] text-muted-foreground">{subtitle(provider)}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    ))}
  </Card>
)

const DefaultProvider = ({ connected }: { readonly connected: ReadonlyArray<ProviderCatalog> }) => {
  const { preferences, savePreferences } = useModels()
  const value = preferences.defaultProvider ?? connected[0]?.id ?? ""

  return (
    <Card>
      <Row title="Default provider" hint="New agents start with this provider.">
        <span className="relative shrink-0">
          <select
            aria-label="Default provider"
            value={value}
            onChange={(event) => savePreferences({ ...preferences, defaultProvider: event.target.value as ProviderId })}
            className="h-9 appearance-none rounded-control-sm border bg-field pl-3 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {connected.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-muted-foreground" />
        </span>
      </Row>
    </Card>
  )
}

export const ProvidersScreen = ({
  agents,
  canManage
}: {
  readonly agents: ReadonlyArray<Agent>
  /** Owners and admins keep the keys. */
  readonly canManage: boolean
}) => {
  const { all } = useModels()
  const [openId, setOpenId] = useState<ProviderId | null>(null)
  const [search, setSearch] = useState("")

  const open = all?.find((provider) => provider.id === openId)
  const matches = (all ?? []).filter((provider) => provider.name.toLowerCase().includes(search.trim().toLowerCase()))
  const connected = matches.filter((provider) => provider.status === "connected")
  // The key in .env is changed in that file, so there is nothing to connect here.
  const others = matches.filter((provider) => provider.status !== "connected" && provider.id !== "api")

  return (
    <>
      <TitleBar>
        {open === undefined ? (
          <span className="text-sm font-semibold">Providers</span>
        ) : (
          <div className="window-no-drag">
            <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
              <ChevronLeft className="size-4" />
              Providers
            </Button>
          </div>
        )}
      </TitleBar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-6 py-7">
          {all === null && <p className="text-sm text-muted-foreground">Looking for providers…</p>}
          {open !== undefined && <ProviderDetail provider={open} agents={agents} />}
          {all !== null && open === undefined && (
            <>
              {(all ?? []).some((provider) => provider.status === "connected") && (
                <DefaultProvider connected={all.filter((provider) => provider.status === "connected")} />
              )}
              <Section
                title="Connected"
                action={
                  <span className="w-56">
                    <SearchField label="Search providers" value={search} onChange={setSearch} />
                  </span>
                }
              >
                {connected.length > 0 ? (
                  <ProviderList providers={connected} onOpen={setOpenId} />
                ) : (
                  <p className="text-[13px] text-muted-foreground">Nothing connected yet.</p>
                )}
              </Section>
              {others.length > 0 && (
                <Section title="Other providers">
                  <ProviderList providers={others} onOpen={setOpenId} />
                </Section>
              )}
              <VoiceSettings canManage={canManage} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
