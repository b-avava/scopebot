# 0025. Answers written live

Date: 2026-11-12
Status: Accepted

## Context

An answer in a chat with the team appeared only when it was finished. With tools and a slow model that is tens of seconds of "typing", with no way to see what the employee does or to stop it. The design (v12 Chat in Paper, sheets 2, 8 and 18) shows the text as it is written, the steps live, a Stop button, and what happens when the model or the connection breaks off.

## Decision

- **The server keeps a live answer per chat with the team**, in memory: its status (`idle`, `answering`, `stopped`, `broke`), the question, the text so far and the steps since the answer began. Each change raises a version. Nothing of it is stored: after a restart every chat is idle, and the saved messages tell the rest.
- **The app asks with a long poll**, through the typed API like everything else: `GET …/live?after=<version>` answers at once when the chat changed since that version, and otherwise after 25 seconds with no change. No sockets or server-sent events, so sessions, errors and visibility work as for every other call, and a lost connection is only a call that failed and is tried again.
- **An answer runs on its own fiber**, detached from the request that asked for it. Closing the app or losing the server does not stop it; the app shows "Lost the server" and the chat reloads when the server is back. Only `POST …/stop` stops it.
- **Stopping saves nothing.** The question stays without an answer, the log keeps "Stopped by a person", and `send` answers with the outcome `stopped`. What came stays greyed on screen with "Answer again". Steps already done stay done. When the model breaks off after it began to write, the same happens with the status `broke`.
- **Providers stream when they can.** A request may carry `onText`, told the reply so far. The Anthropic API (`messages.stream`) and Claude Code (`--include-partial-messages`) stream; the OpenAI-compatible API and Codex answer at the end, which the app shows the same way. Each model starts the text over, so a fallback never runs two replies together. Tool calls and the notes for the log (`[[…]]`) are cut from the text so far, including one that has not closed yet.
- Only chats with the team are written live. A client on a channel gets a message once, finished.

## Consequences

- "Continue" after a stop, from the design, is not built: answering again starts over.
- A message written while the employee answers waits in the composer, which is busy until the answer ends. The queue from the design is not built.
- Two app windows on one chat both see the answer, since the state is per chat, not per window.
- One server process holds the live state. Several processes behind a balancer would each see only their own answers.
