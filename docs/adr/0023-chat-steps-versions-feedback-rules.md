# 0023. Steps, versions, feedback and rules in the chat

Date: 2026-11-12
Status: Accepted

## Context

The chat with an employee showed only text. A person could not see what the employee did for an answer, could not ask again or fix their question, and had no way to say that an answer was wrong other than editing the instructions by hand. The activity log (ADR 0022) already keeps every step and its reason. The design is on the v12 Chat page in Paper.

## Decision

- **Steps under an answer** come from the records of the log: the actions with the same source message as the reply, apart from the reply itself, with the reason the model gave. When an answer has versions, each gets the steps since the one before, and a try that ended in `Could not reply` keeps its steps to itself. A new endpoint returns the actions of one chat, with the same visibility as the chat.
- **Versions instead of rewriting history.** A message can say which message it `replaces`. Answering again adds a reply that replaces the earlier one; editing the last question adds a question that replaces it, and its own answer. Nothing is deleted, and the chat shows `1 / 2` to switch. The employee's memory and the model's history take only the latest versions, so an old answer never comes back as context. Picking an older version only changes what the person sees, and while one is picked the last exchange cannot be answered again or edited.
- **Only in chats with the team.** Answering again or editing a question would mean unsending a message to a client, so channel chats keep their drafts instead. Only the last exchange can be answered again or edited. Steps already done stay done: a new version never undoes a booking.
- **Trying again after a failure** is answering again when there was no answer.
- **Feedback** is a 👍 or 👎 on an answer, with reasons and a note, one per person per answer, which they can change.
- **Rules from the team** are kept apart from the instructions, as a list on the employee: text, who added it and from which answer, on or off. The model reads the rules that are on after the instructions, with a line that rules never change what the employee is allowed to do; permissions stay in code.
  - Owners and admins add, change, turn off and delete rules. A member can only suggest one, which waits on the employee until an owner or admin adds or declines it.
  - From a 👎 note the employee writes the rule in one sentence, and the person can change it before it is saved.
  - At most 30 rules that are on, of up to 300 characters each.

## Consequences

- Suggested rules wait in the employee's settings, not in a general approvals screen, which does not exist yet.
- A rule that asks for more than the employee may do is not detected: it simply has no effect, because tools check permissions in code.
- Rule changes are not in the activity log yet, because its records need a source message. The rule keeps who added it and who decided.
- Answering again with another model, shorter or longer, is not built yet.
- Steps link to the activity log only from the log itself; the line under an answer does not open it yet.
