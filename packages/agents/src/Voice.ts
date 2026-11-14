import { ProviderKeys } from "@scope-bot/db"
import {
  NothingHeard,
  type ProviderKey,
  type Transcribe,
  type Transcript,
  VoiceFailed,
  VoiceNotConfigured,
  type VoiceStatus
} from "@scope-bot/domain"
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

const SPEECH_TO_TEXT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
/** A short question comes back in seconds; this only stops a request that hangs. */
const REQUEST_TIMEOUT = "60 seconds"

const ScribeResult = Schema.Struct({
  text: Schema.String,
  language_code: Schema.optionalKey(Schema.NullOr(Schema.String))
})

const extensions: Record<Transcribe["mediaType"], string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/wav": "wav"
}

/** Why a request to ElevenLabs failed, in words the app can show. */
const failureOf = (status: number) => {
  if (status === 401 || status === 403) return new VoiceFailed({ reason: "key_rejected" })
  if (status === 429) return new VoiceFailed({ reason: "rate_limited" })
  if (status === 422 || status === 400) return new VoiceFailed({ reason: "invalid_audio" })
  return new VoiceFailed({ reason: `api_${status}` })
}

/**
 * Speech to text for the composer (ADR 0026), with ElevenLabs Scribe. The key
 * is the business's own, kept encrypted on the server like model keys.
 */
export class Voice extends Context.Service<
  Voice,
  {
    readonly status: Effect.Effect<VoiceStatus>
    saveKey(input: ProviderKey): Effect.Effect<void>
    readonly removeKey: Effect.Effect<void>
    transcribe(input: Transcribe): Effect.Effect<Transcript, VoiceNotConfigured | VoiceFailed | NothingHeard>
  }
>()("@scope-bot/agents/Voice") {
  static readonly layer = Layer.effect(
    Voice,
    Effect.gen(function* () {
      const keys = yield* ProviderKeys
      const http = yield* HttpClient.HttpClient
      // Scribe v2 is the batch model in ElevenLabs' reference; a newer one can be set without a release.
      const model = yield* Config.String("ELEVENLABS_STT_MODEL").pipe(Config.withDefault("scribe_v2"))

      const keyOf = keys.get("elevenlabs").pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new VoiceNotConfigured()),
            onSome: (stored) => Effect.succeed(stored.key)
          })
        )
      )

      return Voice.of({
        status: keys
          .get("elevenlabs")
          .pipe(Effect.map((stored) => ({ provider: "elevenlabs" as const, configured: Option.isSome(stored) }))),
        saveKey: (input) => keys.save("elevenlabs", { key: input.key }),
        removeKey: keys.remove("elevenlabs"),
        transcribe: Effect.fn("Voice.transcribe")(function* (input) {
          const key = yield* keyOf
          const form = new FormData()
          form.append("model_id", model)
          form.append(
            "file",
            new Blob([Buffer.from(input.audio, "base64")], { type: input.mediaType }),
            `speech.${extensions[input.mediaType]}`
          )
          const request = HttpClientRequest.post(SPEECH_TO_TEXT_URL).pipe(
            HttpClientRequest.setHeader("xi-api-key", Redacted.value(key)),
            HttpClientRequest.bodyFormData(form)
          )
          const response = yield* http.execute(request).pipe(
            Effect.timeout(REQUEST_TIMEOUT),
            Effect.mapError(() => new VoiceFailed({ reason: "unavailable" }))
          )
          if (response.status >= 300) return yield* failureOf(response.status)
          const body = yield* response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(ScribeResult)),
            Effect.mapError(() => new VoiceFailed({ reason: "invalid_response" }))
          )
          const text = body.text.trim()
          if (text === "") return yield* new NothingHeard()
          return { text, language: body.language_code ?? null }
        })
      })
    })
  )
}
