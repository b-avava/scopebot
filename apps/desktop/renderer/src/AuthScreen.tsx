import { type Account, MIN_PASSWORD_LENGTH } from "@scope-bot/domain"
import { LensAvatar } from "@scope-bot/ui/components/avatar/LensAvatar.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { type ReactNode, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { errorMessage, useTheme } from "./hooks.ts"
import { AppFrame } from "./TitleBar.tsx"

const inputClasses = { label: "px-0 text-[13px] font-medium text-muted-foreground" }

type Mode = "login" | "register" | "join"

const titles: Record<Mode, { readonly heading: string; readonly hint: string; readonly action: string }> = {
  login: { heading: "Sign in to Scope Bot", hint: "Your team is waiting.", action: "Sign in" },
  register: {
    heading: "Create your business",
    hint: "You become its owner, and your employees start from here.",
    action: "Create business"
  },
  join: { heading: "Join your team", hint: "Use the code a colleague sent you.", action: "Join" }
}

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
    <path
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      fill="#FFC107"
    />
    <path
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      fill="#FF3D00"
    />
    <path
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      fill="#4CAF50"
    />
    <path
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      fill="#1976D2"
    />
  </svg>
)

const AppleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      fill="currentColor"
    />
  </svg>
)

const MicrosoftLogo = () => (
  <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden="true" className="shrink-0">
    <rect x="0" y="0" width="10" height="10" fill="#F25022" />
    <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
    <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
    <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
  </svg>
)

const providers = [
  { name: "Google", logo: <GoogleLogo /> },
  { name: "Apple", logo: <AppleLogo /> },
  { name: "Microsoft", logo: <MicrosoftLogo /> }
] as const

const Switcher = ({ children, onClick }: { readonly children: ReactNode; readonly onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-sm text-[13px] font-semibold text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
  >
    {children}
  </button>
)

/** The other two ways in, under the form. */
const OtherWays = ({ mode, open }: { readonly mode: Mode; readonly open: (next: Mode) => void }) => {
  const links = [
    mode !== "register" && (
      <Switcher key="register" onClick={() => open("register")}>
        Create a business
      </Switcher>
    ),
    mode !== "join" && (
      <Switcher key="join" onClick={() => open("join")}>
        I have an invite
      </Switcher>
    ),
    mode !== "login" && (
      <Switcher key="login" onClick={() => open("login")}>
        Sign in
      </Switcher>
    )
  ].filter(Boolean)

  return (
    <p className="flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
      <span>{mode === "login" ? "New to Scope Bot?" : "Or"}</span>
      {links[0]}
      <span aria-hidden="true">·</span>
      {links[1]}
    </p>
  )
}

export const AuthScreen = ({ onSignedIn }: { readonly onSignedIn: (account: Account) => void }) => {
  useTheme()
  const [mode, setMode] = useState<Mode>("login")
  const [businessName, setBusinessName] = useState("")
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const creating = mode !== "login"
  const passwordTooShort = creating && password.length < MIN_PASSWORD_LENGTH
  const ready =
    email.trim() !== "" &&
    password !== "" &&
    !passwordTooShort &&
    (mode !== "register" || businessName.trim() !== "") &&
    (mode === "login" || name.trim() !== "") &&
    (mode !== "join" || code.trim() !== "")

  const request = (): Promise<BridgeResult<Account>> => {
    if (mode === "login") return window.scopeBot.login({ email, password })
    if (mode === "join") return window.scopeBot.joinTeam({ code, name, email: email.trim(), password })
    return window.scopeBot.register({ businessName, name, email: email.trim(), password })
  }

  const submit = async () => {
    setBusy(true)
    setNotice(null)
    const result = await request()
    setBusy(false)
    if (result.ok) onSignedIn(result.value)
    else setError(errorMessage(result.error))
  }

  const open = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  const { heading, hint, action } = titles[mode]

  return (
    <AppFrame>
      <main className="mr-0.5 mb-0.5 ml-0.5 flex min-h-0 flex-1 overflow-y-auto rounded-xl border bg-background p-6">
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

          {mode === "login" && (
            <>
              <div className="flex flex-col gap-2.5">
                {providers.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    onClick={() => {
                      setError(null)
                      setNotice(`Signing in with ${provider.name} is not set up yet. Use your email for now.`)
                    }}
                    className="flex h-11 items-center justify-center gap-2.5 rounded-control border bg-field text-sm font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {provider.logo}
                    Continue with {provider.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="h-px grow bg-border" />
                <span className="text-xs text-muted-foreground">or with email</span>
                <span className="h-px grow bg-border" />
              </div>
            </>
          )}

          <div className="flex flex-col gap-3">
            {mode === "register" && (
              <Input label="Business name" value={businessName} onChange={setBusinessName} classNames={inputClasses} />
            )}
            {mode === "join" && <Input label="Invite code" value={code} onChange={setCode} classNames={inputClasses} />}
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

          {notice !== null && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy || !ready} className="h-11 w-full">
            {action}
          </Button>

          <OtherWays mode={mode} open={open} />
        </form>
      </main>
    </AppFrame>
  )
}
