# 0012. PostgreSQL, accounts and businesses

Date: 2026-11-07
Status: Accepted. Replaces the file storage of ADR 0004 and the local API without authentication.

## Context

Data lived in one JSON file that was rewritten on every change, and the API had no users, so it could not leave one machine. The product is meant for many businesses on one server. Storage, accounts and isolation had to come together, because a login means nothing while everyone shares the same data.

## Decision

- **PostgreSQL through `@effect/sql-pg`.** It is the driver the README names, it speaks the protocol itself, so `pg` is not needed, and it is the only new dependency. Migrations are in `packages/db/src/Migrations.ts` and run when the server starts. Only after they finish does the port open, because a request that arrives earlier is never answered.
- **`Store` stays the only storage boundary.** `pgStoreLayer` is the real one. The memory layer stays for fast tests of domain services.
- **`CurrentBusiness` is a context reference, not an argument.** The API sets it from the session, and `PgStore` reads it in every query. Domain services did not change, and they cannot forget it. Without a business, storage fails instead of guessing.
- **Keys are `(business_id, id)` in every table, and foreign keys include `business_id`.** The database itself then refuses a link to another business, and a reused id cannot overwrite its record. This matters because some ids, such as stage ids, come from the client.
- **Relational columns for what reports and filters need, `jsonb` for nested settings.** Amounts are `numeric`, dates are `date`, and stages and links to services are tables. The agent's permissions and hours stay `jsonb`, since nothing queries them yet.
- **Domain services check links**, so a bad id answers 422 (`ReferenceNotFound`) and not 500. Foreign keys remain the last line.
- **A user belongs to one business, and an email is unique.** Registering creates the business and its owner in one transaction. Roles are `owner`, `admin` and `member`. Owners and admins manage the team, API keys and the business profile.
- **Passwords use scrypt with the OWASP parameters from `node:crypto`,** so no dependency is needed. The parameters are stored in each hash, so they can be raised later.
- **Sessions are random tokens, and the server stores only their SHA-256.** They last 30 days from the last use, and can be revoked at once, which a signed JWT cannot do without extra state. Changing a password signs out other devices.
- **The token never reaches the page.** The Electron main process keeps it, encrypted with `safeStorage`, and adds it to requests. The renderer only learns who is signed in.
- **Login answers the same for a wrong email and a wrong password,** takes about the same time, and stops after 10 failures per email in 15 minutes.
- **A person joins with a one-time code** that an owner or admin creates. It lasts 7 days and only its hash is stored.
- **API keys of providers move into the database, per business,** encrypted with AES-256-GCM under `SCOPE_BOT_SECRET`. The catalog of models is cached per business, because it reveals which keys exist.
- **`pnpm db:import <email>` moves the old JSON files into a business.** It runs in one transaction, refuses a business that has data, and leaves the files as they are.
- **Tests of storage and auth run on real PostgreSQL.** Each test file creates its own database from `TEST_DATABASE_URL` and drops it. CI runs a PostgreSQL service.

## Consequences

- The server does not start without `DATABASE_URL` and `SCOPE_BOT_SECRET`. Losing the secret makes stored API keys unreadable, and they must be added again.
- There is no password reset and no email verification, because nothing sends email yet. A forgotten password can only be changed in the database.
- The sign-in screen shows Google, Apple and Microsoft buttons, but they only say the provider is not set up yet. Each needs an app registered with the provider and its keys on the server, and Apple also needs a paid developer account and a public HTTPS address to return to.
- The login limit counts per email. It does not stop one source from trying many emails, and anyone can lock an email for 15 minutes.
- The API speaks plain HTTP. A server reachable from outside needs TLS in front of it, and `HOST` still defaults to `127.0.0.1`.
- A user cannot belong to two businesses, ownership cannot move, and a role cannot change after joining. A business cannot be deleted from the app.
- A deal or contact with no employee as owner still reads "You" for every person in the team. Owners are employees, not users, for now.
- Providers that run on the server's machine, Claude Code and Codex (see ADR 0007), are shared by all businesses on that server. Only API keys are per business. The cooldown of a failing model is also shared.
- Photos in chats are still base64, now in `messages.images`, and loading an employee's messages reads them. They belong in file storage.
- Search uses `ILIKE`, which reads every message of the business. It needs a trigram or full-text index when chats grow.
- Backups are not set up.
