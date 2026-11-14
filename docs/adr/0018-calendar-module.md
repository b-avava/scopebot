# 0018. Calendar as an optional module

Date: 2026-11-09
Status: Accepted

## Context

Businesses that work by appointment (clinics, salons, repair shops, tutors) need to book clients, see the day of each person who takes appointments, and have deals follow the visits. Most other businesses never need this, so it must not get in their way. Two bookers must never get the same time, whether they are people or AI employees writing on different channels at once.

## Decision

- **Off by default.** `CalendarSettings.enabled` is false for a new business. The owner turns it on under Business → Features. Only then does the Calendar show in the rail, appointments show on deals and clients, and the calendar API answer; otherwise it answers `CalendarOff` (409). Turning it off keeps all data.
- **Specialists, not doctors.** Whoever takes appointments is a `Specialist`: a person, a room or a piece of equipment. It has week hours with breaks, the services it does, time off, and optionally the user who signs in as it.
- **Service length lives on the service** (`Service.minutes`). Without it an appointment takes 30 minutes.
- **Free times are computed in code** from hours, breaks, time off, the busy appointments, the buffer between appointments, the notice and the days ahead. The model never decides whether a time is free.
- **Taking a time is atomic.** `CalendarStorage.take` checks clashes (with the buffer) and writes in one step: a `SELECT ... FOR UPDATE` on the specialist row inside a transaction on PostgreSQL, a semaphore in memory. Moving and approving take the time again the same way.
- **Statuses:** `held`, `pending`, `booked`, `confirmed`, `arrived`, `no-show`, `cancelled`. A held time is kept for `holdMinutes` while a client decides, and stops being busy when it runs out. `pending` waits for a person's OK.
- **AI employees are strict, people are not.** An appointment booked by an employee must fit the hours, the notice and the days ahead. A person may book outside the hours, for example an urgent visit, but never over another appointment.
- **Deals follow appointments by rules,** not by the model: `stageRules` names the stage for booked, arrived, no-show and all cancelled. Booking a client who has no open deal starts one ("Service · Client", priced from the service) when the booked rule is set. Every change is an event on the deal and the client.
- **Who sees what.** A member linked to a specialist sees and changes only their own appointments, and books and moves only into their own calendar. Only owners and admins change the settings and the specialists.
- **Time zone per business,** default `Asia/Tbilisi`, handled with `Intl` only, so no date library is added.

## Consequences

- AI employees book through the tools in ADR 0019, which make the `held` and `pending` appointments.
- Reminders are sent as ADR 0020 says. Held times that ran out, or whose draft was not sent, are not busy and are hidden, but stay stored as held.
- A person moves an appointment through the dialog or by dragging its card to another time or specialist, in steps of 15 minutes. While dragging, the card shows a clash with another appointment, its buffer, or a specialist who does not do the service, and a drop there changes nothing. The server still decides: when someone took the time meanwhile, the card stays and the screen says who took it, with other times to pick. Dropping onto a break or outside the hours is allowed, as for any booking by a person.
- One break per day in the settings screen, although the data allows more.
