# 0026. Voice input

Date: 2026-11-12
Status: Accepted

## Context

People in a business often talk faster than they type, in Georgian, Russian or English, sometimes mixed. The chat with the team had a disabled microphone button. The design (v12 Chat in Paper, sheets 5 and 10) records in the composer, shows the time and a waveform, and turns what was said into text the person checks before sending. The provider was chosen by the owner: ElevenLabs Scribe, which lists Georgian among its high-accuracy languages.

## Decision

- **Batch transcription after recording.** The app records with the browser's `MediaRecorder` (Opus in WebM), and on Done sends the recording to the server, which posts it to ElevenLabs `POST /v1/speech-to-text` with `model_id` `scribe_v2` and lets Scribe find the language. The text goes into the composer after what was typed; nothing is sent until the person sends it. A live transcript while speaking (Scribe's realtime model) is not built.
- **The key stays on the server.** An owner or admin adds the business's ElevenLabs key under Providers → Voice input. It is kept encrypted with the model keys and never sent back; anyone in the team may then speak. The model can be changed with `ELEVENLABS_STT_MODEL` without a release.
- **Speech-to-text is a service of its own** (`Voice`), so another provider can take its place behind the same API.
- **Limits and failures say what to do.** A recording stops at three minutes. When nothing could be made out, or ElevenLabs did not answer, the recording is kept in the app for ten minutes to try again without saying it again. When the system does not let the app use the microphone, the app opens its microphone settings.

## Consequences

- The recording leaves the business for ElevenLabs. ElevenLabs keeps logs by default; zero retention is only for its enterprise customers, so a business that needs it must have that plan.
- A question said aloud is a normal message: it does not keep the recording or say that it was spoken.
- Voice works only in chats with the team, not in replies to clients on channels.
