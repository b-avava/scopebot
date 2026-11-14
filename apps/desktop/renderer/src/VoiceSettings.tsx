import type { VoiceStatus } from "@scope-bot/domain"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Mic } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { errorMessage } from "./hooks.ts"

const fieldClasses =
  "h-10 w-full rounded-control-sm border bg-field px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** The ElevenLabs key that lets the team speak instead of type (ADR 0026). Owners and admins keep it. */
export const VoiceSettings = ({ canManage }: { readonly canManage: boolean }) => {
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [adding, setAdding] = useState(false)
  const [key, setKey] = useState("")
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const result = await window.scopeBot.voiceStatus()
    if (result.ok) setStatus(result.value)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = async () => {
    const result = await window.scopeBot.saveVoiceKey(key.trim())
    setKey("")
    if (!result.ok) return setError(errorMessage(result.error))
    setAdding(false)
    setError(null)
    await reload()
  }

  const remove = async () => {
    const result = await window.scopeBot.removeVoiceKey()
    if (result.ok) await reload()
    else setError(errorMessage(result.error))
  }

  const configured = status?.configured === true
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[13px] font-medium">Voice input</h2>
        <p className="text-[13px] text-muted-foreground">
          The team speaks to employees instead of typing. ElevenLabs Scribe writes it down in Georgian, Russian, English
          and 90 more languages, and the text waits in the chat to be checked before it is sent.
        </p>
      </div>
      <div className="flex flex-col divide-y rounded-card border">
        <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
          <Mic className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">ElevenLabs Scribe</span>
            <span className="text-[13px] text-muted-foreground">
              {error ??
                (status === null
                  ? "Looking…"
                  : configured
                    ? "Key saved. It stays on the server and is never shown again."
                    : canManage
                      ? "Paste an ElevenLabs API key with speech to text allowed."
                      : "Not set up. An owner or admin adds the key here.")}
            </span>
          </span>
          {canManage && configured && (
            <Button size="sm" variant="outline" onClick={() => void remove()}>
              Remove key
            </Button>
          )}
          {canManage && status !== null && !configured && !adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              Add key
            </Button>
          )}
        </div>
        {adding && !configured && (
          <div className="flex flex-col gap-2 p-3">
            <input
              aria-label="ElevenLabs API key"
              type="password"
              autoComplete="off"
              placeholder="API key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className={fieldClasses}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={key.trim() === ""} onClick={() => void save()}>
                Save key
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
