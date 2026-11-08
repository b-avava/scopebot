# 0017. Instagram Direct through the official API

Date: 2026-11-09
Status: Accepted

## Context

Instagram is the third channel customers write on. Unlike WhatsApp (ADR 0015) there is no safe way around the official API: unofficial clients get accounts blocked fast. The official Instagram API with Instagram Login needs a Meta app, a professional Instagram account, and a public HTTPS address, because Instagram sends new messages to a webhook instead of being asked for them.

## Decision

- **One Meta app per server,** set with `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN` and `PUBLIC_URL`. Without all four Instagram stays off, and the screen says what is missing.
- **The owner signs in with Instagram in the browser.** The app asks the server for the sign in address, and main opens it only if it is Instagram's. Instagram sends the person back to `PUBLIC_URL/instagram/oauth/callback` with a one-time state the server handed out, so the redirect needs no session. The code becomes a token that lasts 60 days, kept encrypted and renewed when fewer than 15 days are left.
- **The webhook trusts only signed bodies.** `POST /instagram/webhook` checks `X-Hub-Signature-256` against the app secret, answers at once, and handles the messages after, since Meta waits only seconds. `GET` answers Meta's check with the verify token. Echoes of the account's own messages are left out.
- **The same inbox as the other channels** (ADR 0016): contacts, drafts, handoffs and sending go through `ChannelInbox`.
- **The time to answer is Instagram's rule.** The employee answers only within 24 hours of the customer's last message. A person can still answer for up to seven days, sent with the human agent tag. The chat shows the time left.
- **Whether Instagram can reach the server is checked** by calling `PUBLIC_URL/health`, on start and when someone asks.

## Consequences

- Until Meta reviews the app, only accounts added to it as testers can connect. The human agent tag needs its own permission in that review.
- A contact has no Instagram field yet, so a sender is known by their chat, not by a username on the contact.
- The username of a sender with a name is not kept; the chat shows the name.
- Only text is handled. Photos, voice and shared posts arrive as a short description.
- Nothing was tried against Meta yet: the tests use a fake Instagram, and the end-to-end run checked the screens with stored data.
