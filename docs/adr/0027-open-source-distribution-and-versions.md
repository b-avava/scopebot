# 0027. Open source, distribution and versions

Date: 2026-11-15
Status: Accepted. Settles the licence question in ADR 0015, and changes the README's rule that the desktop app is the client.

## Context

The repository became public on 2026-11-14. Scope Bot is no longer meant to be sold as a service: businesses deploy it on their own server, with their own model and channel accounts, and the authors run nothing they depend on. Until now the repository had no licence, so nobody could legally use it. WhatsApp brings in `libsignal` under GPL-3.0 (ADR 0015). The only interface was the Electron app, which every person would have to install, and nothing defined how a business gets a version or updates it.

## Decision

- **The licence is AGPL-3.0-only.** It lets any business use Scope Bot for its work, commercial work included. It can be combined with the GPL-3.0 `libsignal`, which section 13 of both licences allows. Whoever runs a changed version for other people over a network must offer them its source, so a hosted fork stays open. `-only` keeps a later version of the licence from applying without a decision. Contributions come in under the same licence, with no CLA.
- **The authors run no service that Scope Bot needs.** Every business runs its own server. A feature that would need a central service, such as a relay for push notifications or tunnels, is a separate decision.
- **The server ships as a Docker image** for Linux on amd64 and arm64, with a Docker Compose file that adds PostgreSQL and a reverse proxy for HTTPS. It runs the same on a rented server and on a machine in the office.
- **The web interface comes first.** The server serves the interface to any browser, so people need nothing installed. The desktop app shows the same interface and adds what a browser cannot: notifications and, later, the local executor. Installers are built for Windows and Linux first, and for macOS once the app can be signed and notarized. How the web interface signs in and talks to the server gets its own ADR.
- **One version for the whole repository,** in SemVer from 0.1.0. The server, the desktop app and the packages are released together, and the packages are not published.
- **Releases are prepared by release-please** from the titles of merged pull requests, which become commits on `main` with squash merges. Its release pull request raises the version and writes the changelog. The tag it creates builds the Docker image, the installers and the GitHub release.
- **Updates move forward only.** A published migration never changes, downgrades are not supported, and the update guide asks for a backup first. The server reports its version, and a client warns when it does not match.
- **Security problems are reported privately** through GitHub's private vulnerability reporting, as `SECURITY.md` explains.

## Consequences

- Images and installers are built from public tags, so their source is always available, as the GPL and the AGPL require.
- A business that runs Scope Bot unchanged has nothing to publish. One that changes it and lets other people use it over a network must offer them the changed source.
- Changing the licence later needs the consent of everyone whose code is in the repository.
- Signing costs money: Apple's developer program for macOS, and a certificate for Windows, which shows a SmartScreen warning without one. Until then macOS has no installer.
- Personal Claude Code and Codex subscriptions (ADR 0007) stay for trying Scope Bot on one's own computer. The setup guide must say that serving clients needs an API key.
- None of this is built yet: the Docker image, the web interface and the release pipeline are on the roadmap. Version numbers are still `0.0.0`.
