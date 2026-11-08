# 0009. A general product, with contacts as the first CRM entity

Date: 2026-11-07
Status: Accepted

## Context

The README named clinics as the first vertical, and the roadmap put appointments and doctor schedules in the CRM core. Scope Bot is not built for clinics in particular, so the core has to fit any business. The CRM core also did not exist yet, and PostgreSQL is still not available on the development machine.

## Decision

- **The core is business-neutral.** Contacts, deals, pipelines, activities and documents are the core. Booking is an optional module with neutral terms: a resource and a time slot, not a doctor and a patient.
- **Contacts come first,** because deals, activities and channels all point at a contact.
- **Contacts use `Store` for now,** as ADR 0004 intends. `Store` stays the only storage boundary, so moving to PostgreSQL changes that service and not the code above it.
- **The `Contacts` service lives in `packages/agents`,** next to `Agents`. A separate package is not worth it for one service. It moves out if CRM services grow.
- **Channels are three plain fields,** `phone`, `whatsapp` and `telegram`, where empty means not used. The same shape as `BusinessProfile`, and enough for the channels the product supports.
- **Consent starts as not agreed.** A contact has to agree to being messaged first and to marketing.

## Consequences

- Nothing enforces consent yet, because agents cannot message anyone first. The tool layer must check it when they can.
- Two contacts can share a phone number. Channels must become unique before incoming messages are matched to contacts, because the sender's identity decides whose data an agent may see. Bitrix24 import needs the same check to stay idempotent.
- Contacts have no business id, like everything else in `Store`. It must come with PostgreSQL.
- Deleting a contact removes it completely. Once deals and activities point at contacts, deletion has to decide what happens to them.
- The list loads every contact and has no search, and global search does not cover contacts. This only works while the data fits in the JSON file.
- `AgentPermissions` still has fixed fields such as `bookAppointments`, and job presets are built around them. They should become a policy per tool when the tool layer arrives. The business screen and the hidden hiring suggestions also still use clinic examples.
