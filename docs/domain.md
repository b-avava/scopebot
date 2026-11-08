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

Something the business sells. It has a `name`, `description`, `category`, `pricing` (`fixed`, `from`, `hourly` or `monthly`), a `price` or none, `duration`, `packages` and `active`. `quotePolicy`, `proposalPolicy`, `discountPolicy` and `maxDiscountPercent` say what employees may do, and `sellerIds` who may sell it. Empty `sellerIds` means every employee.

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

## Agent layer

### Department

A named group of employees. An employee belongs to one department or none. Removing a department keeps its employees. It changes nothing about how they work yet (see ADR 0010).

### Agent

An AI employee. `AgentSettings` holds what the business can change: colour, job title in its own words, sign on the avatar, department, tone, instructions, model and backups, `active`, permissions, limits, working hours and escalation rules. New agents get their first tone, limits, permissions and sign from the role picked when hiring (sales, support, follow-ups, reports or blank), and the agent keeps that role in `role` (see ADR 0014). The avatar shows an `AgentState` worked out from data: paused, waiting for an approval, with a person, after hours or working (see ADR 0013).

Working hours and the daily reply limit are enforced in code. Permissions and the discount limit are only instructions until the tool layer exists (see ADR 0004).

### Conversation and ChatMessage

A `Conversation` is one tab of an employee, and an employee always has at least one. Messages belong to a conversation and have the role `customer`, `agent`, `note` or `person`. Models and customers never see a note. A person is someone from the team writing to a customer themselves. How memory works across conversations is in ADR 0008.

A conversation on a channel is a chat with one customer, not a tab:

| Field       | Meaning                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `channel`   | `whatsapp` or `telegram`. Empty for tabs                                                                                  |
| `address`   | Where to answer: the WhatsApp chat id, or `bot:<chat>` and `business:<connection>:<chat>` on Telegram. Unique per channel |
| `contactId` | The customer, when known. A new sender becomes one unless only contacts get answers                                       |

Messages in such a chat have a `delivery`: `draft` waits for a person, then `sending`, `sent` or `failed`; `discarded` was thrown away. `externalId` is the id the channel gave the message, so one is never stored twice. Only sent messages count as said to the customer, for the model too. A draft can carry a `handoff`: the reason the employee wants a person, which takes effect when the draft is sent. A channel chat shares no memory with other chats, and search leaves it out.

### Instagram account

One professional account per business, through the official Instagram API with Instagram Login (see ADR 0017): the same settings as the other channels, the access token (encrypted) and when it expires, the account's id that messages from Instagram name, its username and name. A chat's address is the sender's Instagram-scoped id.

### Telegram bot

One bot per business, through the official Bot API (see ADR 0016): the same settings as WhatsApp, the bot's token (encrypted), its username and name, the next update to ask for, and the Telegram Business account the bot answers for, if its owner added it.

### WhatsApp link

One number per business, linked as a device (see ADR 0015): the employee who answers every chat, who gets answers (`everyone` or `contacts`), whether the employee answers alone, the number and when it was linked. The device keys are stored encrypted.

### AgentAction

An immutable audit record: agent, tool, status, summary, source message, model and tokens. Every reply writes one, including failed ones.

### Escalation

A conversation handed to a human. The agent stays silent in that conversation until it is resolved.

## Models

`ProviderId`, `ModelChoice` and `ReasoningEffort` describe which model an agent uses. See ADR 0006 and ADR 0007.
