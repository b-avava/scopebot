# 0024. Markdown and cards in the chat

Date: 2026-11-12
Status: Accepted

## Context

Answers in a chat with the team were plain text, so a day of appointments came as a long paragraph, and the model wrote out data the app already has. The design (v12 Chat in Paper, sheet 9) shows formatted answers and cards drawn from CRM records.

## Decision

- **Markdown in chats with the team only.** The app draws headings, lists, bold, italic, strikethrough, quotes, links and tables with `react-markdown` and `remark-gfm` (agreed new dependencies: a safe Markdown renderer that never runs HTML, and tables). Raw HTML is dropped; images, code and anything else show as their plain text. A single newline stays a line break, as models mean it. The model is told it may use Markdown only when it answers someone from the team; clients on channels get the text as it is.
- **Links leave the app only through the main process**, and only `https`, `http` and `mailto`, after the person agrees in a dialog. Nothing in a model's text opens on its own.
- **A card names records; it does not copy them.** A reply keeps `cards`: for now `{ kind: "day", day, specialistId }`, one specialist's day. The `schedule` tool returns a card for each day and specialist it found appointments for, and the reply keeps those of the last look-ups, at most three. The app draws each card from the calendar when it shows it, with the person's own visibility, so its numbers are those of the database even if the calendar changed after the answer. The model is told the cards are there, and not to list every appointment again.
- "Open in Calendar" on a card opens the calendar on that day.

## Consequences

- A card may show something other than what the answer says, when the calendar changed since. The line under the answer says the card is the calendar as it is now.
- Only day cards exist. A client card, a single appointment and a deal need a tool that looks them up in the chat with the team first.
- A table copies as its Markdown text.
