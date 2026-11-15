import { type Account, type AuthOptions, MIN_PASSWORD_LENGTH } from "@scope-bot/domain"
import { LensAvatar } from "@scope-bot/ui/components/avatar/LensAvatar.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { type ReactNode, useCallback, useEffect, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { errorMessage, useTheme } from "./hooks.ts"
import { AppFrame } from "./TitleBar.tsx"

const inputClasses = { label: "px-0 text-[13px] font-medium text-muted-foreground" }

type Mode = "setup" | "login" | "register" | "join"

const titles: Record<Mode, { readonly heading: string; readonly hint: string; readonly action: string }> = {
  setup: {
    heading: "Set up Scope Bot",
    hint: "Create the business and become its owner. The server wrote a setup code to its log when it started.",
    action: "Set up"
  },
  login: { heading: "Sign in to Scope Bot", hint: "Your team is waiting.", action: "Sign in" },
  register: {
    heading: "Create your business",
    hint: "You become its owner, and your employees start from here.",
    action: "Create business"
  },
  join: { heading: "Join your team", hint: "Use the code a colleague sent you.", action: "Join" }
}

const switchLabels: Record<Exclude<Mode, "setup">, string> = {
  login: "Sign in",
  register: "Create a business",
  join: "I have an invite"
}

/** What the server allows (ADR 0028). A new server with sign-up closed offers only its setup. */
const modesFor = (options: AuthOptions): ReadonlyArray<Mode> => {
  if (options.needsSetup && !options.signupOpen) return ["setup"]
  return options.signupOpen ? ["login", "register", "join"] : ["login", "join"]
}

const firstMode = (options: AuthOptions): Mode => {
  if (!options.needsSetup) return "login"
  return options.signupOpen ? "register" : "setup"
}

interface Fields {
  readonly setupCode: string
  readonly businessName: string
  readonly name: string
  readonly code: string
  readonly email: string
  readonly password: string
}

const filled = (value: string) => value.trim() !== ""

/** Every field the mode shows is filled, and a new password is long enough. */
const isReady = (mode: Mode, fields: Fields) => {
  if (!filled(fields.email) || fields.password === "") return false
  if (mode === "login") return true
  if (fields.password.length < MIN_PASSWORD_LENGTH || !filled(fields.name)) return false
  if (mode === "join") return filled(fields.code)
  return filled(fields.businessName) && (mode !== "setup" || filled(fields.setupCode))
}

/** Used while the server cannot be reached: signing in is what most people come for. */
const unknownServer: AuthOptions = { needsSetup: false, signupOpen: false }

const Switcher = ({ children, onClick }: { readonly children: ReactNode; readonly onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-sm text-[13px] font-semibold text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
  >
    {children}
  </button>
)

/** The other ways in that this server allows, under the form. */
const OtherWays = ({
  mode,
  modes,
  open
}: {
  readonly mode: Mode
  readonly modes: ReadonlyArray<Mode>
  readonly open: (next: Mode) => void
}) => {
  const others = modes.filter((item): item is Exclude<Mode, "setup"> => item !== mode && item !== "setup")
  if (others.length === 0) return null

  return (
    <p className="flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
      <span>{mode === "login" ? "New to Scope Bot?" : "Or"}</span>
      {others.map((item, index) => (
        <span key={item} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true">·</span>}
          <Switcher onClick={() => open(item)}>{switchLabels[item]}</Switcher>
        </span>
      ))}
    </p>
  )
}

export const AuthScreen = ({ onSignedIn }: { readonly onSignedIn: (account: Account) => void }) => {
  useTheme()
  const [options, setOptions] = useState<AuthOptions | null>(null)
  const [mode, setMode] = useState<Mode>("login")
  const [setupCode, setSetupCode] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOptions = useCallback(async () => {
    const result = await window.scopeBot.getAuthOptions()
    const next = result.ok ? result.value : unknownServer
    setOptions(next)
    setMode(firstMode(next))
    if (!result.ok) setError(errorMessage(result.error))
  }, [])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  const creating = mode !== "login"
  const ready = isReady(mode, { setupCode, businessName, name, code, email, password })

  const request = (): Promise<BridgeResult<Account>> => {
    if (mode === "login") return window.scopeBot.login({ email, password })
    if (mode === "join") return window.scopeBot.joinTeam({ code, name, email: email.trim(), password })
    const owner = { businessName, name, email: email.trim(), password }
    return window.scopeBot.register(mode === "setup" ? { ...owner, setupCode: setupCode.trim() } : owner)
  }

  const submit = async () => {
    setBusy(true)
    const result = await request()
    setBusy(false)
    if (result.ok) {
      onSignedIn(result.value)
      return
    }
    setError(errorMessage(result.error))
    // Someone else finished the setup first, so this server now wants a sign-in or an invite.
    if (result.error === "signup-closed") {
      const next = await window.scopeBot.getAuthOptions()
      if (next.ok) {
        setOptions(next.value)
        setMode(firstMode(next.value))
      }
    }
  }

  const open = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  const { heading, hint, action } = titles[mode]

  return (
    <AppFrame>
      <main className="mr-0.5 mb-0.5 ml-0.5 flex min-h-0 flex-1 overflow-y-auto rounded-xl border bg-background p-6">
        {options !== null && (
          <form
            aria-label={heading}
            className="m-auto flex w-full max-w-[380px] flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (ready && !busy) void submit()
            }}
          >
            <div className="flex flex-col items-center gap-4 pb-1 text-center">
              <LensAvatar size={56} color="#3B8BEB" />
              <div className="flex flex-col gap-1.5">
                <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em]">{heading}</h1>
                <p className="text-sm text-muted-foreground">{hint}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {mode === "setup" && (
                <Input
                  label="Setup code"
                  placeholder="XXXX-XXXX-XXXX"
                  autoComplete="off"
                  value={setupCode}
                  onChange={setSetupCode}
                  classNames={inputClasses}
                />
              )}
              {(mode === "register" || mode === "setup") && (
                <Input
                  label="Business name"
                  value={businessName}
                  onChange={setBusinessName}
                  classNames={inputClasses}
                />
              )}
              {mode === "join" && (
                <Input label="Invite code" value={code} onChange={setCode} classNames={inputClasses} />
              )}
              {creating && <Input label="Your name" value={name} onChange={setName} classNames={inputClasses} />}
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
                classNames={inputClasses}
              />
              <Input
                label="Password"
                type="password"
                autoComplete={creating ? "new-password" : "current-password"}
                value={password}
                onChange={setPassword}
                classNames={inputClasses}
              />
              {creating && (
                <p className="text-[13px] text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
              )}
            </div>

            {error !== null && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy || !ready} className="h-11 w-full">
              {action}
            </Button>

            <OtherWays mode={mode} modes={modesFor(options)} open={open} />
          </form>
        )}
      </main>
    </AppFrame>
  )
}
