import { ThinkingShimmer } from "@scope-bot/ui/components/agents/loading-states/thinking-shimmer.tsx"
import { Button } from "@scope-bot/ui/components/motion/button/index.tsx"
import { Check, CircleAlert, MicOff, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { type Recording, toBase64, useRecorder } from "./useRecorder.ts"

/** A recording that was not made out is kept this long, to try again without saying it again. */
const KEPT_MS = 10 * 60 * 1000

type Problem = "denied" | "no-microphone" | "not-heard" | "failed" | "not-configured" | "key-rejected"

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

/**
 * Speaking instead of typing (ADR 0026): record, then the server writes down
 * what was said, and the text goes into the composer to check before sending.
 */
export const useVoiceInput = (onText: (text: string) => void) => {
  const recorder = useRecorder()
  const [writing, setWriting] = useState(false)
  const [failure, setFailure] = useState<Problem | null>(null)
  const kept = useRef<{ readonly recording: Recording; readonly until: number } | null>(null)

  const transcribe = useCallback(
    async (recording: Recording) => {
      setFailure(null)
      setWriting(true)
      const result = await window.scopeBot.transcribe({
        audio: await toBase64(recording.audio),
        mediaType: recording.mediaType
      })
      setWriting(false)
      if (result.ok) {
        kept.current = null
        onText(result.value.text)
        return
      }
      kept.current = { recording, until: Date.now() + KEPT_MS }
      setFailure(
        result.error === "nothing-heard"
          ? "not-heard"
          : result.error === "voice-not-configured"
            ? "not-configured"
            : result.error === "voice-key-rejected"
              ? "key-rejected"
              : "failed"
      )
    },
    [onText]
  )

  const done = useCallback(async () => {
    const recording = await recorder.finish()
    if (recording !== null) await transcribe(recording)
  }, [recorder.finish, transcribe])

  // Three minutes is a note to type, so the recording ends there and is written down.
  useEffect(() => {
    recorder.onLimit.current = () => void done()
  }, [recorder.onLimit, done])

  const retry = () => {
    const recording = kept.current
    if (recording !== null && Date.now() < recording.until) void transcribe(recording.recording)
    else setFailure(null)
  }

  const dismiss = () => {
    kept.current = null
    setFailure(null)
    recorder.dismiss()
  }

  const blocked = recorder.state.kind === "denied" || recorder.state.kind === "no-microphone"
  return {
    recording: recorder.state.kind === "recording" ? recorder.state : null,
    writing,
    problem: blocked ? (recorder.state.kind as Problem) : failure,
    start: () => {
      setFailure(null)
      void recorder.start()
    },
    done: () => void done(),
    cancel: recorder.cancel,
    retry,
    dismiss
  }
}

export type VoiceInput = ReturnType<typeof useVoiceInput>

const Waveform = ({ levels }: { readonly levels: ReadonlyArray<number> }) => (
  <span aria-hidden className="flex h-5 items-center gap-[3px]">
    {Array.from({ length: 28 }, (_, index) => {
      const value = levels[index - (28 - levels.length)]
      return (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the bars are places, not items
          key={index}
          className={`w-[3px] rounded-full ${value === undefined ? "bg-muted-foreground/30" : "bg-foreground"}`}
          style={{ height: value === undefined ? 3 : Math.max(3, Math.round(value * 20)) }}
        />
      )
    })}
  </span>
)

/** In place of the composer while someone speaks, and while it is written down. */
export const RecordingBar = ({ voice }: { readonly voice: VoiceInput }) => (
  <div className="flex flex-col gap-2.5 rounded-[18px] border border-destructive/40 bg-field px-4 pt-3.5 pb-2.5">
    {voice.writing ? (
      <ThinkingShimmer className="text-[15px]">Writing down what you said…</ThinkingShimmer>
    ) : (
      <span className="text-[15px] text-muted-foreground">Listening… Say your question, then press Done.</span>
    )}
    <div className="flex items-center gap-3">
      <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
      <span className="w-10 shrink-0 text-sm font-semibold tabular-nums">{clock(voice.recording?.seconds ?? 0)}</span>
      <Waveform levels={voice.recording?.levels ?? []} />
      <span className="ml-auto text-[13px] text-muted-foreground">Georgian · Russian · English</span>
      <button
        type="button"
        aria-label="Delete the recording"
        title="Delete the recording"
        disabled={voice.writing}
        onClick={voice.cancel}
        className="flex size-9 items-center justify-center rounded-control-sm border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        <Trash2 className="size-4" />
      </button>
      <Button size="sm" disabled={voice.writing || voice.recording === null} onClick={voice.done}>
        <Check className="size-3.5" />
        Done
      </Button>
    </div>
  </div>
)

const problemText: Record<Problem, string> = {
  denied: "Scope Bot can't use the microphone. Allow it in the system settings.",
  "no-microphone": "No microphone was found. Plug one in and try again.",
  "not-heard": "Couldn't make out the words. The recording is kept for 10 minutes.",
  failed: "The words could not be written down. The recording is kept for 10 minutes.",
  "not-configured": "Speaking needs an ElevenLabs key. An owner or admin adds it in Providers.",
  "key-rejected": "ElevenLabs didn't accept the key. An owner or admin checks it in Providers."
}

/** What went wrong with speaking, and the one thing to do next. */
export const VoiceProblem = ({ voice }: { readonly voice: VoiceInput }) => {
  const problem = voice.problem
  if (problem === null) return null
  const action =
    problem === "denied" ? (
      <button
        type="button"
        onClick={() => void window.scopeBot.openMicrophoneSettings()}
        className="shrink-0 text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open settings
      </button>
    ) : problem === "not-heard" || problem === "failed" ? (
      <button
        type="button"
        onClick={voice.retry}
        className="shrink-0 text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try again
      </button>
    ) : null
  return (
    <div role="alert" className="flex items-center gap-2.5 rounded-control border bg-field px-3 py-2 text-[13px]">
      {problem === "denied" || problem === "no-microphone" ? (
        <MicOff className="size-4 shrink-0 text-destructive" />
      ) : (
        <CircleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      )}
      <span className="min-w-0 flex-1">{problemText[problem]}</span>
      {action}
      <button
        type="button"
        aria-label="Close"
        onClick={voice.dismiss}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** Whether speaking works here: a key is saved on the server. Null while it is not known yet. */
export const useVoiceReady = () => {
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    let current = true
    void window.scopeBot.voiceStatus().then((result) => {
      if (current) setReady(result.ok && result.value.configured)
    })
    return () => {
      current = false
    }
  }, [])
  return ready
}
