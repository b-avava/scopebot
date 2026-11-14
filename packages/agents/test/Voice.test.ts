import { assert, describe, it } from "@effect/vitest"
import { ProviderKeys } from "@scope-bot/db"
import { Effect, Layer } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { Voice } from "../src/Voice.ts"

const layerWith = (respond: () => Response, seen: Array<HttpClientRequest.HttpClientRequest> = []) =>
  Voice.layer.pipe(
    Layer.provideMerge(ProviderKeys.layerMemory),
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((sent) => {
          seen.push(sent)
          return Effect.succeed(HttpClientResponse.fromWeb(sent, respond()))
        })
      )
    )
  )

const recording = { audio: Buffer.from("not really opus").toString("base64"), mediaType: "audio/webm" } as const

const withKey = Voice.use((voice) => voice.saveKey({ key: "xi-key" }))

describe("Voice", () => {
  it.effect("needs a key before it can listen", () =>
    Effect.gen(function* () {
      const voice = yield* Voice
      assert.isFalse((yield* voice.status).configured)
      const failure = yield* voice.transcribe(recording).pipe(Effect.flip)
      assert.strictEqual(failure._tag, "VoiceNotConfigured")
      yield* withKey
      assert.isTrue((yield* voice.status).configured)
      yield* voice.removeKey
      assert.isFalse((yield* voice.status).configured)
    }).pipe(Effect.provide(layerWith(() => Response.json({ text: "" }))))
  )

  it.effect("sends the recording to Scribe and returns the text", () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    return Effect.gen(function* () {
      yield* withKey
      const transcript = yield* Voice.use((voice) => voice.transcribe(recording))
      assert.deepStrictEqual(transcript, { text: "რა მაქვს ხვალ?", language: "kat" })
      const sent = seen[0]
      assert.strictEqual(sent?.url, "https://api.elevenlabs.io/v1/speech-to-text")
      assert.strictEqual(sent?.headers["xi-api-key"], "xi-key")
      assert.strictEqual(sent?.body._tag, "FormData")
      const form = sent?.body._tag === "FormData" ? sent.body.formData : new FormData()
      assert.strictEqual(form.get("model_id"), "scribe_v2")
      assert.strictEqual((form.get("file") as File).name, "speech.webm")
    }).pipe(
      Effect.provide(
        layerWith(
          () => Response.json({ text: " რა მაქვს ხვალ? ", language_code: "kat", language_probability: 0.97 }),
          seen
        )
      )
    )
  })

  it.effect("says when nothing was heard", () =>
    Effect.gen(function* () {
      yield* withKey
      const silent = yield* Voice.use((voice) => voice.transcribe(recording)).pipe(Effect.flip)
      assert.strictEqual(silent._tag, "NothingHeard")
    }).pipe(Effect.provide(layerWith(() => Response.json({ text: "  ", language_code: "eng" }))))
  )

  it.effect("tells a rejected key from other failures", () =>
    Effect.gen(function* () {
      yield* withKey
      const rejected = yield* Voice.use((voice) => voice.transcribe(recording)).pipe(Effect.flip)
      assert.deepInclude(rejected, { _tag: "VoiceFailed", reason: "key_rejected" })
    }).pipe(Effect.provide(layerWith(() => new Response("{}", { status: 401 }))))
  )
})
