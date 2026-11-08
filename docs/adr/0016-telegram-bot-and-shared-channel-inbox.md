# 0016. Telegram through a bot, and one inbox for every channel

Date: 2026-11-08
Status: Accepted

## Context

Customers in the region write on Telegram as much as on WhatsApp. Telegram has an official Bot API, free and open to anyone, so there is no reason to link a personal account the way WhatsApp is linked in ADR 0015. Telegram Business also lets a Premium account hand its own chats to a bot.

## Decision

- **A bot per business, made in @BotFather.** The owner pastes its token; Scope Bot checks it with `getMe`, keeps it encrypted with `SCOPE_BOT_SECRET`, and never shows it again.
- **The server asks Telegram for updates** with long polling (`getUpdates`), so it needs no public address, the same as WhatsApp. The offset is stored after each batch, so a restart repeats nothing and loses nothing. A webhook left by another tool is removed, since polling does not work with one.
- **Telegram Business is optional.** When the owner adds the bot under Settings, Telegram Business, Chatbots, Telegram says so and Scope Bot remembers the account. Messages in those chats are answered through that connection; the owner's own messages there are left alone, and nothing is sent while the owner has the bot switched off or without the right to reply.
- **One inbox for every channel.** `ChannelInbox` in `packages/agents` turns senders into contacts and chats, lets the employee draft or answer, and sends what people approve. WhatsApp and Telegram only bring their own way of sending text and their own connection, so a third channel adds little.
- **A Telegram contact is found by its @username.** A new sender becomes a contact with that username, or by name alone when they have none.
- **The settings are the same on every channel:** who answers, whom, and whether the employee answers alone. They share one schema, `ChannelSettings`.
- **No new dependency.** The Bot API is plain HTTPS and JSON, called with `fetch`.

## Consequences

- Telegram does not let a bot write first, and a customer without a username can only be matched to a contact by name in the chat list.
- One token can be used by one business only; two businesses pasting the same token would take each other's updates.
- Telegram Business needs Telegram Premium on the business account.
- Only text is handled. Photos, voice and files arrive as a short description.
- Nothing was tried with a real bot yet: the tests use a fake Telegram, and the end-to-end run only checked that Telegram refuses a made up token.
