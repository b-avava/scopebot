import { type Account, type Invite, MIN_PASSWORD_LENGTH, type User } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Input } from "@scope-bot/ui/components/motion/input.tsx"
import { useCallback, useEffect, useState } from "react"
import { errorMessage } from "./hooks.ts"
import { TitleBar } from "./TitleBar.tsx"

const inputClasses = { label: "px-0 text-[13px] text-muted-foreground" }

const roleLabels: Record<User["role"], string> = { owner: "Owner", admin: "Admin", member: "Member" }

const PasswordForm = () => {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [status, setStatus] = useState<string | null>(null)

  const save = async () => {
    const result = await window.scopeBot.changePassword({ current, next })
    setStatus(result.ok ? "Password changed. Other devices were signed out." : errorMessage(result.error))
    if (result.ok) {
      setCurrent("")
      setNext("")
    }
  }

  return (
    <form
      aria-label="Change password"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h2 className="text-sm font-semibold">Password</h2>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          classNames={inputClasses}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          classNames={inputClasses}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={current === "" || next.length < MIN_PASSWORD_LENGTH}>
          Change password
        </Button>
        {status !== null && (
          <span role="status" className="text-[13px] text-muted-foreground">
            {status}
          </span>
        )}
      </div>
    </form>
  )
}

const Team = ({ account }: { readonly account: Account }) => {
  const [members, setMembers] = useState<ReadonlyArray<User>>([])
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const manages = account.user.role !== "member"

  const reload = useCallback(async () => {
    const result = await window.scopeBot.listTeam()
    if (result.ok) setMembers(result.value)
    else setError(errorMessage(result.error))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const createInvite = async (role: "admin" | "member") => {
    const result = await window.scopeBot.createInvite({ role })
    setInvite(result.ok ? result.value : null)
    setError(result.ok ? null : errorMessage(result.error))
  }

  const remove = async (member: User) => {
    const result = await window.scopeBot.removeMember(member.id)
    setError(result.ok ? null : errorMessage(result.error))
    if (result.ok) await reload()
  }

  return (
    <section aria-label="Team" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">People in {account.businessName}</h2>
        {manages && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void createInvite("member")}>
              Invite a member
            </Button>
            <Button size="sm" variant="outline" onClick={() => void createInvite("admin")}>
              Invite an admin
            </Button>
          </div>
        )}
      </div>

      {invite !== null && (
        <div className="flex flex-col gap-1 rounded-card bg-field p-3.5">
          <p className="text-[13px] text-muted-foreground">
            Send this code to your colleague. It works once and is shown only now.
          </p>
          <code className="text-sm font-medium select-all [overflow-wrap:anywhere]">{invite.code}</code>
        </div>
      )}

      <ul className="flex flex-col">
        {members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{member.name}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{member.email}</span>
            </span>
            <span className="text-[13px] text-muted-foreground">{roleLabels[member.role]}</span>
            {manages && member.role !== "owner" && member.id !== account.user.id && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${member.name}`}
                className="text-destructive"
                onClick={() => void remove(member)}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

export const AccountScreen = ({
  account,
  onSignOut
}: {
  readonly account: Account
  readonly onSignOut: () => void
}) => (
  <>
    <TitleBar>
      <span className="text-sm font-semibold">Account</span>
      <div className="window-no-drag ml-auto">
        <Button size="sm" variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </TitleBar>

    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-6 py-7">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{account.user.name}</h1>
          <p className="text-sm text-muted-foreground">
            {account.user.email} · {roleLabels[account.user.role]} of {account.businessName}
          </p>
        </div>
        <PasswordForm />
        <Team account={account} />
      </div>
    </div>
  </>
)
