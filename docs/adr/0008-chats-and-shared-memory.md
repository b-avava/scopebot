# 0008. Several chats per employee with one memory

Date: 2026-11-07
Status: Accepted, memory narrowed to one person's tabs by ADR 0021

## Context

One employee handles different tasks, and mixing them in one thread makes both the screen and the model's context worse. The tasks still belong to one employee, who should remember what happened elsewhere.

## Decision

- **A `Conversation` is one tab.** Every message and every handoff belongs to a conversation. An employee always has at least one.
- **The first conversation shares its id with the agent.** Older data files upgrade to this without any lookup, because the id of the conversation can be derived from each message's `agentId`.
- **Memory is what the employee said and heard in its other chats.** When replying, the model gets the current chat as the conversation, and the last 40 messages of the other chats as data in the system prompt. Text is cut at 400 characters and photos are left out. This costs no extra model call.
- **Handoffs are per chat.** A chat handed to a human does not silence the employee's other chats. The daily reply limit stays per employee, because it limits the employee.
- **The audit log stays per employee.** The chat screen does not show it. The server keeps recording it, and the planned Activity log screen is where it will appear.
- **A new chat takes its title from the first message.** A double click renames it. Deleting a chat with messages asks first and also removes it from memory, but its audit records stay.

## Consequences

- This memory fits one business testing its employee. **When real customers arrive it must change:** one customer's messages must never reach another customer's chat. Memory then needs a scope per customer, and a chat needs to know its customer.
- Older messages fall out of memory once 40 newer ones exist in other chats. Long-term memory needs summaries or search, which cost model calls.
- Other chats can hold text a customer wrote, so they are marked as data, not instructions.
- A reply in progress keeps running if the person switches tabs, and shows up when they return.
