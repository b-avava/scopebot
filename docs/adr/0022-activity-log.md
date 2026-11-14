# 0022. Activity log

Date: 2026-11-12
Status: Accepted

## Context

Everything an AI employee does is audited (product principle 2), but the records could only be read one employee at a time, through the API, and nobody saw them in the app. They also said too little: not why the employee did it, not which chat, and not who agreed when a person's click made it happen. An owner who cannot see what the employees do cannot trust them with more.

## Decision

- **A screen for owners and admins.** The rail's Activity log opens everyone's actions, newest first, grouped by day. Members do not get it: they do not supervise the employees, and the server answers them `Forbidden`.
- **Tabs stay private.** The log leaves out actions from in-app chats the person may not see, with the same rule as the chats themselves (ADR 0021). So an owner does not see an admin's own chat either. Chats with customers are for everyone who sees the log.
- **The record says more.** `AgentAction` gets five optional fields, so records from before stay valid:
  - `conversationId`, the chat it happened in. The migration fills it for old records from their source message. It has no foreign key, because the record stays when the chat goes.
  - `reason`, why, in the employee's own words. Every prompt asks the model to end each message, tool calls included, with `[[WHY: …]]`. The tag is cut out before anything reaches the customer, like the handoff tag, and kept on the reply and on the tool calls of that round, at most 300 characters. A model that leaves it out simply gives no reason.
  - `decidedBy`, the person whose click made it happen or stopped it, with their name and whether they agreed: sending or throwing away a draft, and doing or leaving a suggestion in a chat with the team. Leaving a suggestion is now recorded too.
  - `replyId` and `appointmentId`, what the action made.
- **What still waits is read as it is now,** not stored: a draft not sent yet, an appointment still `pending`, or a handoff whose chat a person still has. A handoff from a channel is now recorded with the `handoff` tool, as one from an in-app chat already was.
- **Numbers come from SQL.** The page carries the counts for the filters and per day, counted by PostgreSQL in the zone the app sends. Each side of the filter counts with the other side applied: employees with the chosen kind, kinds with the chosen employee. The kind of an action comes from its tool, with the same rules in SQL and in `actionKind`.
- **Pages of 100,** read on with a cursor of time and id, so two actions in the same millisecond are neither skipped nor shown twice.
- **The steps of an action** are everything done in reply to the same customer message: from that message up to their next one in the chat, plus everything with the same source message. That puts a person's later click in the same story as the employee's suggestion.
- **Opening the chat** goes to the channel screen with that chat picked, or to the in-app chat as a search hit does.

## Consequences

- Approving a `pending` appointment in the calendar and deciding an approval request still write no record of who decided, because they have no source message. The log then only stops showing them as waiting.
- The reason is the model's own account, not a proof. It is shown as "in the employee's own words".
- Every reply costs a few more output tokens for the reason.
- The memory store, used in tests of the services, knows no people and no appointments, so it shows no person's name and nothing waiting for an OK. PostgreSQL is tested for both.
- Nothing was tried with a real model: the tests use a scripted one, and the screen was checked on a throwaway database with records written by hand.
