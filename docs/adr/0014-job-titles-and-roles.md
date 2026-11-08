# 0014. Job titles and roles

Date: 2026-11-08
Status: Accepted. Changes how the sign is chosen in ADR 0013.

## Context

The job was picked from four values: Front desk, Sales, Follow-ups and Reports. Each chose the first permissions, tone and limits, and later the sign on the avatar. They came from the first slice, built for a clinic, and a business with an accountant or a delivery coordinator could not name its employee. Changing the job in settings changed only the label, which looked like it should do more.

## Decision

- **The job title is free text** in the business's own words. The model and customers see it, and it changes nothing else.
- **A role is picked once, when hiring.** Sales, Customer support, Follow-ups, Reports or Blank. It sets the first tone, limits, permissions and sign, from `rolePresets` in the domain, and the hiring screen shows what it gives before hiring.
- **Blank asks before everything risky,** so it is the safe start for any job. It is also what an employee gets when no role is sent.
- **The agent keeps the role it was hired with** in `role`, only to say where its settings came from. Settings are the employee's own after hiring.
- **The sign is its own field,** picked in settings or set by the role, and no longer guessed from the title. Migration 0003 gives existing employees the sign of their old job.
- **The presets no longer let anyone book appointments alone.** Booking belongs to a module (see ADR 0009).

## Consequences

- Permissions are still the old fields: appointments, discounts, payment links and documents. Roles cannot speak of quotes, prices or deals until the tool layer brings permissions for them.
- Employees hired before roles show no role in settings.
- Changing the job title never changes permissions, so a person who wants other permissions changes them in settings.
