# 0010. Deals, pipelines and departments

Date: 2026-11-07
Status: Accepted

## Context

Contacts exist (ADR 0009). The next part of the CRM core is deals and the funnels they move through. The sidebar also got one plus next to search that adds an employee or a department, so departments had to exist.

## Decision

- **A deal has one contact, or none.** The README used to say "linked contacts". One is enough for the board and for agents, and a list can replace it when a real case needs it.
- **Every stage has a kind:** `open`, `won` or `lost`. Names belong to the business, so the dashboard cannot read them to know how a deal ended.
- **A business starts with one funnel:** New, In progress, Proposal, Won, Lost. `Deals` creates it when no pipeline exists, so the board works from the first run.
- **`Deals` checks what a deal points at.** The stage must belong to the deal's pipeline and the contact must exist.
- **Removing a contact keeps its deals** and unlinks them, because a deal is a record of the business. This settles the question left open in ADR 0009.
- **A department is only a name for now.** An employee belongs to one department or none, and is picked in the employee's settings. Removing a department keeps its employees. The README's human head waits for users, and handoffs between agents wait for the tool layer.
- **`Departments` and `Deals` live in `packages/agents`** for the same reason as `Contacts` in ADR 0009.
- **`Menu` is the one small menu of the app.** The employee menu, the plus and the department menu all use it.

## Consequences

- The funnel cannot be changed yet. The data allows several pipelines and any stages, but there is no API or screen for it, and the board shows only the first pipeline.
- Deals move through the Stage field in the deal, not by dragging.
- `amount` is a plain number with no currency. A business that works in several currencies needs a currency field before reports add amounts up.
- Agents cannot see or change deals until the tool layer exists.
- Search does not cover deals or departments.
- Department membership changes nothing yet: permissions, memory and escalation do not depend on it.
- If a department is removed while the settings of one of its employees are open, the next change there fails with "This department no longer exists" until the panel is reopened.
