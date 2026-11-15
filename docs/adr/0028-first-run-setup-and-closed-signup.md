# 0028. First-run setup and closed sign-up

Date: 2026-11-15
Status: Accepted. Changes the rule in ADR 0012 that anyone may register a business.

## Context

Registering creates a business and makes the person its owner (ADR 0012). That fits a hosted service, but every business now runs its own server (ADR 0027). Once that server is reachable from the internet, anyone who finds its address can register, get a business of their own, and use the server, including the Claude Code or Codex sign-in on it, which every business on a server shares. A fresh server has a second gap: whoever opens it first becomes the owner. The sign-in screen also shows Google, Apple and Microsoft buttons that do nothing, and a forgotten password can only be changed in the database.

## Decision

- **A server is set up once it has a business.** Until then it needs setup, and nobody can sign in, because there are no users.
- **Setup needs a code from the server's log.** When the server starts and needs setup, it makes a random setup code, about 60 bits, and writes it to its log with a line on what to do with it. Only someone who can read the log, so whoever runs the server, can create the first business. The code lives in memory: a restart makes a new one, and creating the business spends it. If two people try at once, only the first gets a business.
- **After setup, sign-up is closed.** Creating a business fails, and the app no longer offers it. People join an existing business with an invite, as they do today.
- **`SIGNUP=open` brings back open sign-up,** for someone who runs one server for several businesses. Anyone who reaches the server can then create a business, so the setting is off by default and the server logs a warning while it is on.
- **The app asks the server which way in to show.** A new endpoint without a session, `GET /auth/options`, answers whether the server needs setup and whether sign-up is open. On a server that needs setup the app shows only the setup form: setup code, business name, name, email and password.
- **The Google, Apple and Microsoft buttons go away.** None of them is built. When one is, it shows only on a server that has that provider's keys.
- **`pnpm user:reset-password <email>` resets a password from the server.** It sets a new random password, prints it once, signs the user out on every device and clears their failed logins. It runs where the server runs, like `pnpm db:import`.

## Consequences

- An existing server already has a business, so it counts as set up and its sign-up closes on update. Its people sign in as before.
- A second business on a server with closed sign-up needs `SIGNUP=open` for a while. A command that creates a business with its own setup code can come later if people need it.
- The setup code reaches whoever can read the server's log. On a shared machine, that includes everyone who can read the logs.
- A person who forgets their password needs whoever runs the server. There is still no email to reset it alone.
- Tests that register several businesses run with sign-up open.
