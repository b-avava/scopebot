# 0029. The web interface

Date: 2026-11-15
Status: Accepted. Follows ADR 0027, which made the web interface the main way people work.

## Context

The interface is a React page inside Electron. It reaches the outside world only through `window.scopeBot`, a bridge of about 130 methods that the preload script exposes and the Electron main process carries out with `ServerConnection`, an HTTP client of the API. Only four of them need Electron itself: the native theme, opening a link outside the app, the microphone settings of the system, and the status of the server. Live answers are plain requests, not Electron events.

The main process keeps the session token, encrypted, and sends it as a bearer token (ADR 0012). A page in a browser has no such safe place: anything its JavaScript can read, an injected script can steal.

## Decision

- **The browser runs the same interface with another bridge.** A web implementation of `window.scopeBot` talks to the API directly, built on the same client code as the Electron main process. The screens do not change. Where the browser cannot do what Electron does, the web bridge does the nearest safe thing: a link opens in a new tab, the theme follows the system, and the microphone settings become a hint.
- **In a browser the session is a cookie the page cannot read.** It is called `scope_bot_session`, holds the same random token a desktop session gets, and is `HttpOnly`, `SameSite=Strict`, with the path `/`. It lasts 30 days and is renewed whenever the server extends the session, so it ends with the session. Signing out deletes it.
- **`Secure` follows the connection.** A request that arrived over HTTPS, directly or through a proxy that says so in `X-Forwarded-Proto`, gets a `Secure` cookie. Over plain HTTP, such as a server on the office network, the browser would refuse a `Secure` cookie, and the session travels in the clear either way, so the cookie goes without it. HTTPS remains the advice for any server people reach from outside.
- **Browsers sign in through their own endpoints.** `POST /auth/web/register`, `/auth/web/login` and `/auth/web/join` do what their `/auth` twins do, but answer with the account and set the cookie, so the token never reaches JavaScript. The desktop app keeps the `/auth` endpoints and bearer tokens.
- **Every protected endpoint accepts either.** The bearer token is checked first, then the cookie, with the same session rules.
- **Requests with the cookie must come from the server's own page.** A request that changes something (any method but `GET`, `HEAD` and `OPTIONS`) and carries the session cookie, and every request to `/auth/web`, is refused with 403 when its `Origin` is not the address the request was sent to (its `Host`) or `PUBLIC_URL`. Without an `Origin`, `Sec-Fetch-Site` must say `same-origin` or `none`. A request with neither header did not come from a browser page, so it is let through. `SameSite=Strict` already keeps the cookie off requests from other sites; this check also covers older browsers and signing in, where there is no cookie yet.
- **The page and the API share one address.** The server serves the built interface, so the cookie needs no cross-site rules and no CORS. During development a Vite proxy gives the same single address.
- **The work goes in four pull requests:** the cookie session on the server (this one); the client code shared by Electron and the browser; the browser build with its bridge; the server serving the page with security headers.

## Consequences

- A web session cannot be read by the page, so a script injected into it cannot take the session away, though it can still act while the page is open. The CSP that comes with serving the page limits that.
- The same person can be signed in on the desktop app and in a browser, as two sessions.
- Over plain HTTP the cookie and everything else can be read on the network. That is a reason for HTTPS, which the Docker setup brings with Caddy.
- A proxy in front of the server must keep the `Host` header and send `X-Forwarded-Proto`, or `Origin` checks fail and cookies lose `Secure`. Caddy does both by default.
- The microphone works in a browser only over HTTPS or on `localhost`, so voice input needs HTTPS on a server reached from other machines.
