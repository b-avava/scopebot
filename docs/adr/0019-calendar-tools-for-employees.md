# 0019. Calendar tools for AI employees

Date: 2026-11-09
Status: Accepted

## Context

With the calendar on (ADR 0018), AI employees should offer free times, book, move and cancel in their chats with clients, within their permissions. The models come from several providers, including local CLIs (ADR 0007) that have no tool API, and they all must work the same way. Principle 1 says agents use the same services as people, and principle 2 that every action is logged.

## Decision

- **Tools are text tags,** like the handoff tag (ADR 0008): `[[TOOL free_times {...}]]`, `book`, `move` and `cancel`, with JSON input. `AgentChat` runs the tags in a reply through `CalendarTools`, adds the results as the next turn, marked as coming from the system, and asks again, at most four rounds. The customer never sees a tag. An employee that used tools and then has nothing to say hands the chat to a person.
- **Tools call the `Calendar` service,** so the rules for AI employees hold: hours, breaks, notice, days ahead, and taking a time in one step. Free times come from `Calendar.slots`, never from the model. Names of services and specialists are matched in code, and only services the employee may sell count.
- **Only what the permissions allow.** A denied action is not offered and is refused if asked for. `approve` books as `pending` for the Waiting list; a move or a cancel with `approve` becomes an approval request for a person.
- **A client may change an appointment online** only until `clientChangeHours` before it. Later, the employee hands the chat to a person.
- **A draft does its change only when it is sent.** In a chat where a person checks each reply, the reply carries the change in `ChatMessage.appointment`. A booked time is held for `holdMinutes` so nobody else takes it, and "Send and book" turns it into a booking. A move or a cancel waits. The change runs before the message goes out, so a reply that says "booked" is not sent when the time was taken meanwhile; the draft stays for the person to change. "Don't send" lets a held time go at once.
- **The person decides on a draft,** so a draft books even when the employee books with `approve`: sending it is the approval.
- **One change per reply,** so a draft has at most one appointment to show and confirm.
- **Confirming** a client's appointment is a fifth tool, `confirm`, added with reminders (ADR 0020).
- **In-app chats have no client,** so there the employee only looks up free times.
- **Every call is in the audit log** as `calendar.<tool>`, with what it did or why it could not.

## Consequences

- Approving a move or a cancel from the approval list records the answer but does not do it yet, like other approvals (ADR 0011).
- A reply whose message failed on the channel after the change keeps the change; the person sees the failed message.
- The tool results add tokens to every reply that uses them.
- Nothing was tried with a real model: the tests use a scripted model, and the end-to-end run used a stored draft.
