# Security policy

Scope Bot keeps a business's clients, conversations and API keys, so security reports matter to us.

## Reporting a vulnerability

**Do not open a public issue.** Report it privately through GitHub: open the [Security tab](https://github.com/b-avava/scopebot/security) of the repository and choose **Report a vulnerability**. Only the maintainers see the report.

Please include:

- what an attacker can do, and what they need first (an account, a role, network access to the server);
- steps to reproduce, or a proof of concept;
- the version or commit you tested.

We will confirm the report, keep you informed while we fix it, and credit you in the advisory unless you ask us not to. Scope Bot is maintained by volunteers, so a reply may take a few days.

## Supported versions

Scope Bot has no releases yet. Until it does, fixes go to `main` only. After the first release, only the latest one gets security fixes.

## In scope

- The server (`apps/server`) and the packages it uses: authentication, sessions, roles, the isolation between businesses, stored keys.
- The desktop app (`apps/desktop`): the bridge between the page and the main process, and anything that lets a page reach Node or the file system.
- AI employees acting outside their permissions, limits or approvals, including through prompt injection in client messages.

Problems in WhatsApp, Telegram, Instagram, model providers or other services belong to those services. Report them there, unless Scope Bot uses them in an unsafe way.
