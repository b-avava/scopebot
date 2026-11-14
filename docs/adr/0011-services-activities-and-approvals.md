# 0011. Services, activities and approvals

Date: 2026-11-07
Status: Accepted

## Context

The Deals, Contacts and Services screens were designed in Paper with everything a working CRM shows. Building them needed more than screens: a catalog of what the business sells, a history of what happened, a way for an employee to ask a person, and more facts on contacts and deals. Some of what the design shows cannot be real yet, because the channels, files and tools behind it do not exist.

## Decision

- **A service is an entity, not a line in the business profile.** It has a category, a pricing model (`fixed`, `from`, `hourly`, `monthly`), packages, policies for quoting, sending a proposal and discounting, a discount limit and the employees who may sell it. `upgrade()` turns old `business.services` lines into services.
- **An employee is told only the services it may sell, and only active ones.** A service with no price is listed as having none, so the model does not invent one.
- **The business has one `currency`, by default GEL.** Amounts stay plain numbers, and reports add them up in this currency. This settles the question left open in ADR 0010 for a business with one currency.
- **An activity is a note, a task or an event.** It links to a contact, a deal or both. Events are written by the domain services, for example "Moved to Negotiation", so the history cannot disagree with what happened. A person cannot create an event through the screens.
- **A stage has a usual chance, and a deal may have its own.** The weighted forecast uses the deal's chance when there is one. The numbers on the screens are computed from the deals in `crmStats.ts`, never by a model.
- **Stages can be edited, and a stage with deals cannot be removed.** A pipeline needs at least one open, one won and one lost stage. This settles the limit in ADR 0010, and dragging replaces the Stage field.
- **A deal lost by moving it asks for a reason**, because that is what the business learns from.
- **An approval is a request from an employee that a person decides.** Deciding records the answer as an event on the deal, and nothing else. Nothing runs after an approval until the tool layer can run it.
- **"What X knows" is written by the real model and is kept on the contact**, with its author and time. It needs the contact to have an employee as owner. When no model answers, the screen says why and shows no text.
- **The service preview asks the real model** with the prompt employees get. It works from what is saved, so it is off while the form has unsaved changes.
- **What cannot be real is left out, not imitated:** Bitrix24 import, file attachments, sending messages from the CRM, the "Verified" mark on a channel, the Forecast tab, "Take over from" an employee and a "Waiting for a reply" segment. Each needs a channel, a file store or linked messages first.
- **`CrmContext` holds the CRM data for all screens**, so the board, the profile and the catalog cannot show different numbers. A save reloads what it changed.

## Consequences

- Nothing creates approvals yet except the API, because employees have no tools. The screens for them are ready, and the rail's Approvals item only shows a count.
- Service policies and the discount limit are only instructions to the model until the tool layer exists. The service panel says so.
- A `Service` with several packages has one `price` for the catalog. Packages are read by employees and shown in the panel, but a deal links a service, not a package.
- Revenue per service divides a deal equally between its services, because a deal has one amount.
- A failed bulk action stops at the first deal that fails, and the deals before it stay changed.
- Duplicates are only found, by the same phone, WhatsApp or Telegram. They cannot be merged yet.
- Agents still cannot see or change CRM records themselves. Only a summary and a preview reach a model.
