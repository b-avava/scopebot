import { Schema } from "effect"

/**
 * Speaking instead of typing in a chat with the team (ADR 0026). The app
 * records, the server turns the recording into text with a speech provider,
 * and the text goes into the composer to check before it is sent.
 */

/** Who turns speech into text. ElevenLabs Scribe for now; the server can take another. */
export const VoiceProviderId = Schema.Literal("elevenlabs")
export type VoiceProviderId = typeof VoiceProviderId.Type

export const VoiceStatus = Schema.Struct({
  provider: VoiceProviderId,
  /** A key is saved, so the microphone button works. */
  configured: Schema.Boolean
})
export type VoiceStatus = typeof VoiceStatus.Type

/** Longer than this is a note to type, not a question to say. The app stops recording here. */
export const MAX_RECORDING_SECONDS = 180

/** About three minutes of Opus at the rate a browser records speech, as base64, with room to spare. */
const MAX_AUDIO_BASE64 = 6_000_000

export const RecordingType = Schema.Literals(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"])
export type RecordingType = typeof RecordingType.Type

export const Transcribe = Schema.Struct({
  /** The recording, base64. */
  audio: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_AUDIO_BASE64)),
  mediaType: RecordingType
})
export type Transcribe = typeof Transcribe.Type

export const Transcript = Schema.Struct({
  text: Schema.String,
  /** The language heard, as the provider names it, like `kat`, `rus` or `eng`. */
  language: Schema.NullOr(Schema.String)
})
export type Transcript = typeof Transcript.Type

export class VoiceNotConfigured extends Schema.TaggedError<VoiceNotConfigured>()(
  "VoiceNotConfigured",
  {},
  { httpApiStatus: 503 }
) {}

export class VoiceFailed extends Schema.TaggedError<VoiceFailed>()(
  "VoiceFailed",
  /** `key_rejected` when the provider did not accept the key, otherwise what went wrong on the way. */
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}

/** The recording had no words in it, or none the provider could make out. */
export class NothingHeard extends Schema.TaggedError<NothingHeard>()("NothingHeard", {}, { httpApiStatus: 422 }) {}
