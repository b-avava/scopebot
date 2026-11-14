# Domain model

This file describes what exists in `packages/domain`. The target model is in section 6 of the README. Everything below belongs to one business, and storage never crosses that line (see ADR 0012).

## Accounts

### Business

A tenant. It holds the profile, the provider preferences and everything in the CRM and agent layers.

### User

A human who signs in, with `email`, `name` and a `role`: `owner`, `admin` or `member`. A user belongs to one business, and an email is unique across all of them. Owners and admins manage the team, API keys and the business profile. Employees are agents, not users.

### Session and invite

A session is a random token that lasts 30 days from the last use. An invite is a one-time code that lasts 7 days and adds a user with a role. For both, only a hash is stored.

## CRM

### Contact

A person or a company the business works with.

| Field               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `id`                | `ContactId`                                           |
| `kind`              | `person` or `company`                                 |
| `name`              | Required                                              |
| `channels`          | `phone`, `whatsapp`, `telegram`. Empty means not used |
| `consent.messages`  | Agreed to be messaged first, not only answered        |
| `consent.marketing` | Agreed to offers and promotions                       |
| `companyId`         | The company a person works at, or empty               |
| `role`              | What they do there                                    |
| `ownerId`           | The employee in charge. Empty means a person          |
| `tags`              | The business's own labels                             |
| `language`          | What to talk to them in                               |
| `bestTime`          | When to reach them, in the business's own words       |
| `source`            | Where they came from                                  |
| `summary`           | What the owner wrote down about them, or empty        |
| `createdAt`         | ISO time                                              |

Rules:

- Consent starts as not agreed.
- Channels are not unique yet, and nothing enforces consent yet (see ADR 0009). The screen only points out contacts that share one.
- Only a model writes `summary`, through `AgentChat.summarize`, and it needs an owner (see ADR 0011).

### Pipeline and Stage

A pipeline is a funnel with an ordered list of stages. A stage has a `name`, a `kind` (`open`, `won` or `lost`) and a usual chance of closing, `probability`. A business starts with one pipeline. It needs at least one stage of each kind, and a stage with deals cannot be removed (see ADR 0010 and ADR 0011).

### Deal

Something the business is working to close.

| Field            | Meaning                                         |
| ---------------- | ----------------------------------------------- |
| `id`             | `DealId`                                        |
| `title`          | Required                                        |
| `contactId`      | The linked contact, or empty                    |
| `pipelineId`     | Its funnel                                      |
| `stageId`        | A stage of that funnel                          |
| `amount`         | Zero or more, in the business's currency        |
| `source`         | Where it came from, in the business's own words |
| `ownerId`        | The employee in charge. Empty means a person    |
| `nextStep`       | What happens next, and `nextStepAt` when        |
| `closeDate`      | The day it should close, or empty               |
| `probability`    | Its own chance, or empty for the stage's        |
| `lostReason`     | Why it was lost                                 |
| `serviceIds`     | The services it is about                        |
| `createdAt`      | ISO time                                        |
| `stageChangedAt` | When it last changed stage                      |
| `closedAt`       | When it reached a won or lost stage, or empty   |

Rules:

- The stage must belong to the pipeline, and the contact must exist.
- Removing a contact keeps its deals and unlinks them.
- `Deals` keeps `stageChangedAt` and `closedAt`, and records each move as an event.

### Service

Something the business sells. It has a `name`, `description`, `category`, `pricing` (`fixed`, `from`, `hourly` or `monthly`), a `price` or none, `duration`, `minutes` an appointment takes (optional, used by the calendar), `packages` and `active`. `quotePolicy`, `proposalPolicy`, `discountPolicy` and `maxDiscountPercent` say what employees may do, and `sellerIds` who may sell it. Empty `sellerIds` means every employee.

Rules:

- An employee is told only the active services it may sell.
- The policies are only instructions until the tool layer exists (see ADR 0011).
- Removing a service takes it off its deals.

### Activity

What happened with a contact or a deal: a `note`, a `task` or an `event`. A task has `done` and `dueAt`. The domain services write events, so a person only adds notes and tasks. Removing a deal removes its activities. Removing a contact removes the ones that are only about the contact, and unlinks the ones that belong to a deal.

### ApprovalRequest

An employee asks a person before something risky: `title`, `reason`, and the deal and contact it is about. `status` is `pending`, `approved` or `declined`. It can be decided once, and the answer is recorded as an event. Nothing runs after it yet (see ADR 0011).

### BusinessProfile

The facts all agents may tell customers: name, address, phone, opening hours and about, with the `currency` of all amounts. Together with the services, this is what agents may say. Whatever is not here, agents must not invent.

## Calendar

An optional module, off until the business turns it on (see ADR 0018). While it is off, the calendar API answers `CalendarOff` and nothing about appointments shows.

### CalendarSettings

One per business: `enabled`, `timeZone` (default `Asia/Tbilisi`), `minNoticeMinutes`, `maxDaysAhead`, `bufferMinutes` between appointments, `holdMinutes` a time is kept while a client decides, `clientChangeHours` before which a client may still move or cancel, `stageRules` and `reminders`.

- `stageRules` has a stage, or none, for `booked`, `arrived`, `noShow` and `allCancelled`. The stages must belong to the business.
- `reminders` are `minutesBefore`, `enabled` and `text`. They go to the client's chat, as ADR 0020 says.
- `notices` are the texts a client gets when a person moves (`moved`) or cancels (`cancelled`) their appointment from a chat with an employee.
- `assistantId` is the employee the team asks about the schedule, or none (see ADR 0021).

### ReminderLog

What happened to one reminder of an appointment: `appointmentId`, `startsAt`, `minutesBefore`, `outcome` (`sent`, `skipped` or `failed`), `reason` and `at`. It is written before the reminder goes out, so none goes twice. It is kept per start time, so a moved appointment is reminded again.

### Specialist

Whoever takes appointments: a person, a room or equipment. It has a `name`, `title`, `color`, an optional `userId` of the person who signs in as it, `active`, `hours` for Monday to Sunday (each `open`, `from`, `to` and `breaks`), `serviceIds` it does and `timeOff` ranges.

Rules:

- Only active specialists get appointments, and only for the services they do.
- Removing a specialist removes its appointments.
- A member linked to a specialist sees only that specialist's appointments.

### Appointment

A time with a specialist: `specialistId`, `serviceId`, `contactId`, `dealId`, `startsAt`, `endsAt`, `status`, `holdExpiresAt`, `bookedBy` (`agentId` and `channel`, both empty for a person), `note` and `cancelReason`.

Rules:

- `status` is `held`, `pending`, `booked`, `confirmed`, `arrived`, `no-show` or `cancelled`. All but the last two take the time; a held one only until `holdExpiresAt`.
- Its length is the service's `minutes`, or 30. With `bufferMinutes`, two busy appointments of one specialist never overlap. The check and the write happen in one step.
- An appointment booked by an AI employee must fit the hours, breaks, time off, notice and days ahead. A person may book outside the hours, never over another appointment.
- `pending` and `held` become `booked` only by taking the time again. A cancelled, arrived or no-show appointment cannot change.
- Booking a client with no open deal starts one when `stageRules.booked` is set. The deal then moves by `stageRules`, and each change is an event on the deal and the client.

## Agent layer

### Department

A named group of employees. An employee belongs to one department or none. Removing a department keeps its employees. It changes nothing about how they work yet (see ADR 0010).

### Agent

An AI employee. `AgentSettings` holds what the business can change: colour, job title in its own words, sign on the avatar, department, tone, instructions, model and backups, `active`, permissions, limits, working hours and escalation rules. New agents get their first tone, limits, permissions and sign from the role picked when hiring (sales, support, follow-ups, reports or blank), and the agent keeps that role in `role` (see ADR 0014). The avatar shows an `AgentState` worked out from data: paused, waiting for an approval, with a person, after hours or working (see ADR 0013).

Working hours and the daily reply limit are enforced in code. The appointment permissions are enforced by the calendar tools (see ADR 0019). The other permissions and the discount limit are only instructions until their tools exist (see ADR 0004).

### Conversation and ChatMessage

A `Conversation` is one tab of an employee, and an employee always has at least one. Messages belong to a conversation and have the role `customer`, `agent`, `note` or `person`. Models and customers never see a note. A person is someone from the team writing to a customer themselves. How memory works across conversations is in ADR 0008. A tab has an `ownerId`: only that person sees it, and the memory is shared only among their tabs. Tabs from before have none, and only owners and admins see them (see ADR 0021).

A conversation on a channel is a chat with one customer, not a tab:

| Field       | Meaning                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `channel`   | `whatsapp` or `telegram`. Empty for tabs                                                                                  |
| `address`   | Where to answer: the WhatsApp chat id, or `bot:<chat>` and `business:<connection>:<chat>` on Telegram. Unique per channel |
| `contactId` | The customer, when known. A new sender becomes one unless only contacts get answers                                       |

Messages in such a chat have a `delivery`: `draft` waits for a person, then `sending`, `sent` or `failed`; `discarded` was thrown away. `externalId` is the id the channel gave the message, so one is never stored twice. Only sent messages count as said to the customer, for the model too. A draft can carry a `handoff`: the reason the employee wants a person, which takes effect when the draft is sent. A reply can carry an `appointment`: the booking, move or cancel it does. On a draft it happens only when a person sends it, and a booked time is held until then (see ADR 0019). In a tab it is a suggestion, and `decided` keeps whether the person did it (`done`) or not (`left`) (see ADR 0021). A channel chat shares no memory with other chats, and search leaves it out.

In a tab the last question can be edited and the last answer given again (ADR 0023). Neither deletes anything: the new message names the first version in `replaces`, and every version of a message names the same one. What a chat shows is worked out by `visibleMessages`: the latest version of each message, or the one a person picked, and an older version of a question hides the answers that came after it. The model's history and the memory shared between tabs always use the latest versions. A channel chat has no versions, since the client already has the message.

A reply in a tab may carry `cards`: the records the app draws under it from the calendar as they are now, never from the model's text. A card is a `ChatCard`; today only `{ kind: "day", day, specialistId }`, one specialist's appointments on a day that the `schedule` tool looked up. At most three per reply (ADR 0024). A card also keeps the appointments the answer saw, so it can show what moved away or came since.

### LiveAnswer

What a chat with the team shows while its employee answers (ADR 0025): a version that grows with each change, a status (`idle`, `answering`, `stopped` by a person, or `broke` when the model broke off after it began to write), the question, the text so far without tool calls and notes for the log, and the steps since the answer began. The server keeps it in memory only. A stopped or broken answer saves nothing; the log keeps "Stopped by a person" or "Could not reply".

### MessageFeedback

A person's 👍 or 👎 on an answer they can see: `good` or `bad`, up to four reasons (`wrong-facts`, `too-long`, `wrong-tone`, `should-ask-person`) and a note. One per person and answer; giving it again replaces it. Each person sees only their own (ADR 0023).

### AgentRule

A rule the team taught an employee, kept apart from its instructions (ADR 0023). It has its text (up to 300 characters), whether it is `enabled`, a `status` (`active`, `suggested` or `declined`), who suggested it and who decided it, and the answer it came from, if any. An owner or admin adds a rule as `active` at once; a member's rule is `suggested` until an owner or admin accepts or declines it. An employee follows at most 30 rules that are active and on. The model reads them after the instructions, with a line that they never change what the employee is allowed to do.

### Instagram account

One professional account per business, through the official Instagram API with Instagram Login (see ADR 0017): the same settings as the other channels, the access token (encrypted) and when it expires, the account's id that messages from Instagram name, its username and name. A chat's address is the sender's Instagram-scoped id.

### Telegram bot

One bot per business, through the official Bot API (see ADR 0016): the same settings as WhatsApp, the bot's token (encrypted), its username and name, the next update to ask for, and the Telegram Business account the bot answers for, if its owner added it.

### WhatsApp link

One number per business, linked as a device (see ADR 0015): the employee who answers every chat, who gets answers (`everyone` or `contacts`), whether the employee answers alone, the number and when it was linked. The device keys are stored encrypted.

### AgentAction

An immutable audit record: agent, tool, status, summary, source message, model and tokens. Every reply writes one, including failed ones. Since ADR 0022 it also keeps the chat it happened in, why (in the employee's own words, from a `[[WHY: …]]` tag the customer never sees), the person who agreed to it or turned it down (`decidedBy`), and the reply or appointment it made, so the activity log can tell whether that still waits. Older records have none of these, except the chat, which the migration found from their source message.

### Activity log

What the people who supervise see of the records (ADR 0022): a page of `ActivityEntry` (the action, its chat with the client's or the person's name, the message that started it, and what still waits: a draft, an appointment waiting for an OK, or a chat a person has), the counts for its filters and the counts per day, all from SQL. An action's kind (`reply`, `appointment`, `lookup`, `handoff`) comes from its tool. The steps of an action are everything done in reply to the same customer message, up to their next one.

Under an answer in a tab the app shows the same steps, split per version of the answer: the actions for its question since the previous version, without those of a try that ended in `Could not reply`, and the reason of the reply itself (ADR 0023).

### Voice input

Speaking instead of typing in a chat with the team (ADR 0026). The app records, the server turns the recording into a `Transcript` (the text and the language heard) with a speech provider, ElevenLabs Scribe for now, and the text goes into the composer to check before it is sent. `VoiceStatus` says whether the business has saved its key. Nothing of the recording is stored.

### Escalation

A conversation handed to a human. The agent stays silent in that conversation until it is resolved.

## Models

`ProviderId`, `ModelChoice` and `ReasoningEffort` describe which model an agent uses. See ADR 0006 and ADR 0007.
