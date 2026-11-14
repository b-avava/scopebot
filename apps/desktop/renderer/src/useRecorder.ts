import { MAX_RECORDING_SECONDS, type RecordingType } from "@scope-bot/domain"
import { useCallback, useEffect, useRef, useState } from "react"

/** How many bars the waveform shows, and how often it moves. */
const BARS = 28
const TICK_MS = 100

export interface Recording {
  readonly audio: Blob
  readonly mediaType: RecordingType
  readonly seconds: number
}

export type RecorderState =
  | { readonly kind: "idle" }
  | { readonly kind: "recording"; readonly seconds: number; readonly levels: ReadonlyArray<number> }
  /** The person or the system did not let the app use the microphone. */
  | { readonly kind: "denied" }
  | { readonly kind: "no-microphone" }

const KNOWN: ReadonlyArray<RecordingType> = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"]

/** The recorder's type without its codec, as the server takes it. */
const recordingType = (mimeType: string): RecordingType =>
  KNOWN.find((known) => mimeType.startsWith(known)) ?? "audio/webm"

/** Opus in WebM is small and what Chromium records best. */
const preferred = () =>
  ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type))

interface Session {
  readonly stream: MediaStream
  readonly recorder: MediaRecorder
  readonly chunks: Array<Blob>
  readonly context: AudioContext
  readonly timer: ReturnType<typeof setInterval>
  readonly startedAt: number
}

const level = (analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>) => {
  analyser.getByteTimeDomainData(samples)
  let sum = 0
  for (const sample of samples) sum += ((sample - 128) / 128) ** 2
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}

/**
 * Records the microphone for the composer (ADR 0026): how long it has been,
 * and how loud, for the waveform. Nothing leaves the app until it is done.
 */
export const useRecorder = () => {
  const [state, setState] = useState<RecorderState>({ kind: "idle" })
  const session = useRef<Session | null>(null)
  const onLimit = useRef<() => void>(() => undefined)

  const release = useCallback(() => {
    const current = session.current
    session.current = null
    if (current === null) return
    clearInterval(current.timer)
    for (const track of current.stream.getTracks()) track.stop()
    void current.context.close()
  }, [])

  useEffect(() => release, [release])

  const start = useCallback(async () => {
    if (session.current !== null) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ""
      setState({ kind: name === "NotFoundError" ? "no-microphone" : "denied" })
      return
    }
    const type = preferred()
    const recorder = new MediaRecorder(stream, type === undefined ? {} : { mimeType: type })
    const chunks: Array<Blob> = []
    recorder.addEventListener("dataavailable", (event) => chunks.push(event.data))
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const startedAt = Date.now()
    let levels: ReadonlyArray<number> = []
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      levels = [...levels, level(analyser, samples)].slice(-BARS)
      setState({ kind: "recording", seconds, levels })
      if (seconds >= MAX_RECORDING_SECONDS) onLimit.current()
    }, TICK_MS)
    session.current = { stream, recorder, chunks, context, timer, startedAt }
    recorder.start()
    setState({ kind: "recording", seconds: 0, levels: [] })
  }, [])

  /** Stops and hands over what was said. */
  const finish = useCallback(async (): Promise<Recording | null> => {
    const current = session.current
    if (current === null) return null
    const stopped = new Promise((resolve) => current.recorder.addEventListener("stop", resolve, { once: true }))
    current.recorder.stop()
    await stopped
    release()
    setState({ kind: "idle" })
    return {
      audio: new Blob(current.chunks, { type: current.recorder.mimeType }),
      mediaType: recordingType(current.recorder.mimeType),
      seconds: Math.round((Date.now() - current.startedAt) / 1000)
    }
  }, [release])

  /** Stops and throws the recording away. */
  const cancel = useCallback(() => {
    if (session.current?.recorder.state === "recording") session.current.recorder.stop()
    release()
    setState({ kind: "idle" })
  }, [release])

  const dismiss = useCallback(() => setState({ kind: "idle" }), [])

  return { state, start, finish, cancel, dismiss, onLimit }
}

/** A recording as base64, for the server. */
export const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const CHUNK = 0x8000
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}
