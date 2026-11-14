# 0020. Appointment reminders

Date: 2026-11-09
Status: Accepted

## Context

The calendar settings already hold reminders (ADR 0018): how long before the start, on or off, and a text. Clients should get them on the channel they write from, and fewer people should forget to come. A reminder is the business writing first, which the contact's consent and Instagram's rules (ADR 0017) limit. A reminder must never go twice, even when the server restarts.

## Decision

- **A loop on the server** checks every minute, for each business with the calendar on, the booked and confirmed appointments that start within the longest reminder.
- **Only the closest due reminder goes.** After a pause, the earlier ones are kept as skipped instead of arriving one after another. A reminder whose time had already passed when the appointment was booked is skipped too.
- **Each reminder is claimed before it goes out,** in `appointment_reminders`, keyed by appointment, start time and minutes before. So it goes at most once, and a moved appointment is reminded again of its new time. If it fails, the reason is kept and it is not tried again, so a broken channel does not fill the chat with failed messages.
- **Who gets one:** a client who booked in a chat, or one who agreed to be messaged first (`consent.messages`). Anyone else is skipped, with that reason.
- **Where it goes:** the chat the client booked from, or else the one they wrote in last, on WhatsApp, Telegram or Instagram. It goes as the employee of that chat, with no draft, because the business wrote the text. Instagram sends it only within 24 hours of the client's last message.
- **The text** fills `{name}` (first name), `{service}`, `{specialist}`, `{date}`, `{time}` and `{address}`, and drops what an empty value leaves behind.
- **The answer goes to the employee.** The reminder is in the chat, so the employee sees it, and a new `confirm` tool marks the appointment confirmed when the client says they will come. Confirming needs no permission and no person, since it changes nothing the client did not ask for. Moving or cancelling goes through the tools and permissions of ADR 0019.
- **The appointment shows each reminder:** sent and when, or why it did not go.

## Consequences

- With no chat on any channel, a client gets no reminder: there is no SMS or email yet.
- A paused employee, or one outside its hours, does not read the answer, so the appointment stays not confirmed until a person marks it.
- A reminder that failed is not sent again, even if the channel comes back before the appointment.
- One loop per server. Two servers on the same database would still not send twice, because of the claim.
- Nothing was sent to a real channel: the tests use fake senders, and the end-to-end run checked the screens with stored data.
