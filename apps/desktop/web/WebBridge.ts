import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { type ApiConnection, makeApiConnection } from "../client/ApiConnection.ts"
import type { BridgeResult, ScopeBotBridge } from "../preload/bridge.ts"

/** The same links the desktop app opens. Anything else, such as `javascript:`, never opens. */
const LINK_PROTOCOLS = new Set(["https:", "http:", "mailto:"])

const INSTAGRAM_LOGIN = "https://www.instagram.com/"

type Promised<T> =
  T extends Effect.Effect<infer A>
    ? () => Promise<A>
    : T extends (...args: infer P) => Effect.Effect<infer A>
      ? (...args: P) => Promise<A>
      : never

/** The bridge speaks in promises, the client in effects. Every call of the client already ends in a result. */
const promised = (api: ApiConnection) =>
  Object.fromEntries(
    Object.entries(api).map(([name, value]) => [
      name,
      Effect.isEffect(value)
        ? () => Effect.runPromise(value as Effect.Effect<unknown>)
        : (...args: ReadonlyArray<unknown>) =>
            Effect.runPromise((value as (...input: ReadonlyArray<unknown>) => Effect.Effect<unknown>)(...args))
    ])
  ) as { readonly [K in keyof ApiConnection]: Promised<ApiConnection[K]> }

/**
 * `window.scopeBot` for a browser (ADR 0029). It talks to the API at `url` with the
 * session cookie, and does the nearest safe thing where the desktop app asks Electron.
 */
export const makeWebBridge = (url: string): ScopeBotBridge => {
  const api = Effect.runSync(
    makeApiConnection({ url, session: { kind: "cookie" } }).pipe(Effect.provide(FetchHttpClient.layer))
  )
  const { status, instagramLogin, ...calls } = promised(api)

  return {
    ...calls,
    getServerStatus: status,
    // The page colours itself; this makes the browser's own parts, such as the list of a select, follow.
    setTheme: async (theme) => {
      document.documentElement.style.colorScheme = theme
    },
    // A link in an employee's answer comes from a model, so it opens only after the person agrees.
    openLink: async (url) => {
      const link = URL.canParse(url) ? new URL(url) : null
      if (link === null || !LINK_PROTOCOLS.has(link.protocol)) return
      if (window.confirm(`Open this link in a new tab?\n\n${link.href}`)) {
        window.open(link.href, "_blank", "noopener,noreferrer")
      }
    },
    // A page cannot open the system's settings, so it says where the browser keeps the permission.
    openMicrophoneSettings: async () => {
      window.alert(
        "Allow the microphone for this site in your browser: click the icon next to the address, then allow the microphone. Browsers allow it only over HTTPS or on localhost."
      )
    },
    // The tab opens while the click still counts, so the browser does not block it. Only Instagram's own page loads.
    startInstagramLogin: async (): Promise<BridgeResult<void>> => {
      const tab = window.open("about:blank", "_blank")
      const result = await instagramLogin()
      if (!result.ok || !result.value.url.startsWith(INSTAGRAM_LOGIN)) {
        tab?.close()
        return result.ok ? { ok: false, error: "invalid" } : result
      }
      if (tab === null) {
        window.location.assign(result.value.url)
      } else {
        tab.opener = null
        tab.location.href = result.value.url
      }
      return { ok: true, value: undefined }
    }
  }
}
