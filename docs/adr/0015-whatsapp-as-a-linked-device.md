# 0015. WhatsApp as a linked device

Date: 2026-11-08
Status: Accepted. Replaces the rule in the README that allowed only the official WhatsApp Business API.

## Context

Businesses want their employees to answer customers on WhatsApp. The official WhatsApp Business API needs a Meta Business account, an approved app, a number registered with Meta and a public HTTPS address for incoming messages, which takes days to set up and is not there yet. OpenBot links a WhatsApp account as a device instead, the way WhatsApp Web does, through the Baileys library: a QR code scanned on the phone is enough, and messages arrive over a socket the computer opens, with no public address.

## Decision

- **A number links as a device through Baileys** (`@whiskeysockets/baileys` 7.0.0-rc14), with a QR code or a code typed on the phone. It lives in the new `packages/integrations` behind a `WhatsAppClient` service, so the official API can come later as a second implementation.
- **It runs on the server, not in the desktop app**, unlike OpenBot. Employees work on the server (see the README), so they answer while every app is closed. Linked numbers reconnect when the server starts, and a dropped connection retries with growing pauses up to a minute.
- **One number per business, and every chat on it goes to one employee**, chosen in the settings. Changing the employee moves the chats to the new one.
- **Every reply is a draft until the business says otherwise.** The employee writes it, and a person sends it, changes it or throws it away. "Answers alone" sends replies right away, within the employee's permissions and limits. An employee waiting with a draft shows the approval state on its avatar.
- **Who gets answers:** everyone, where a new sender becomes a contact owned by the employee, or only contacts already in the CRM. Messages from others are kept for people to answer. Groups, statuses, channels and the business's own messages from the phone are never handled.
- **A chat with a customer is a conversation with a channel**, not a tab of the employee. It shares no memory with other chats, in either direction, so one customer never sees what another said. Global search leaves these chats out.
- **The device keys are encrypted** with `SCOPE_BOT_SECRET`, like provider keys, and never leave the server. Baileys logs nothing.
- **Linking and settings are for owners and admins.** Members read the chats and answer them.
- **`qrcode` turns the QR text into rows of modules**, and the app draws them, so the page needs no images.

## Consequences

- WhatsApp can limit or ban a number it thinks is automated. The screen says so before linking and suggests a number kept for Scope Bot. A business that cannot take the risk needs the official API, which is still the goal.
- Baileys depends on `libsignal` under GPL-3.0. That is fine while the server is not given to anyone, but shipping it to customers or self-hosting them needs a legal check, or a replacement as OpenBot made.
- Only text is handled. Photos, voice and files arrive as a short description, and nothing but text is sent.
- Messages someone sends from the phone itself do not show up in Scope Bot.
- WhatsApp removes a linked device after about 14 days without a connection, so the server has to keep running.
- The app asks for new messages every few seconds instead of being told. The rail badge can be up to 15 seconds late.
- Messages from one customer are handled one at a time, so a second message waits for the reply to the first.
- Nothing was tested with a real phone yet: the tests use a fake WhatsApp, and the end-to-end run only checked that WhatsApp gives a real QR code.
