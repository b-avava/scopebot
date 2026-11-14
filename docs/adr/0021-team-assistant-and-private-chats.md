# 0021. Team assistant and private chats

Date: 2026-11-09
Status: Accepted

## Context

Specialists open Scope Bot and ask an employee about their schedule: what they have tomorrow, who has not confirmed, or to move a client. In the calendar, a member who signs in as a specialist sees only their own clients (ADR 0018). Until now, the in-app chats with an employee were shared by the whole team, together with the employee's memory of them (ADR 0008). So a specialist could read, in a shared chat, answers about other specialists' days.

## Decision

- **A tab belongs to the person who opens it.** New tabs get an `ownerId`, and only that person sees them, in the tab list, in search and in the team list's last message. The employee's memory is shared only among the tabs of one person. Tabs from before have no owner, and only owners and admins see them. A member who has no tab gets one when they open the employee. This replaces the shared memory of ADR 0008 for people who work in teams; a business with one person works as before.
- **The storage filters chats by the person asking,** set from the session like the business (`CurrentViewer`). Chats with customers on channels stay visible to everyone, and background work sees every chat.
- **In an in-app chat, the employee answers the team, not a client.** It is told who asks and, if they take appointments, that "me" means them. Its tools there are `schedule` (appointments with clients and statuses, and the free time between them), `free_times`, and `move` and `cancel`. A member who is a specialist gets only their own appointments, as in the calendar.
- **Moving and cancelling are only suggested.** The reply carries the suggestion, and the chat shows it with "Move and tell…", "Another time" and "Leave it". Only the person's click changes the appointment, under a person's rules, and the decision is kept on the message, so it is made once. The client is then told in their chat, with texts the business sets (`CalendarSettings.notices`), and under the same rules as reminders (ADR 0020). A note in the chat says whether the client was told.
- **The team assistant** is the employee set in `CalendarSettings.assistantId`. A specialist's own day shows who comes next, what the CRM knows about them, the rest of the day, and a box to ask the assistant, which opens the person's own chat with the question.
- **A specialist's calendar** has only their own column, Day and Week, and no approvals or settings.

## Consequences

- The person's role, not the employee's permissions, decides what they can change from the team chat: the employee only suggests.
- Booking a new client from the team chat is not built; the calendar's "New appointment" does it.
- Answers are text: the schedule is not shown as a table in the chat yet.
- An owner's tabs are private too, so admins no longer see the owner's new tabs.
- Nothing was tried with a real model: the tests use a scripted model, and the end-to-end run used a stored suggestion.
