import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { Config, Effect, Layer, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"

/** Built by `pnpm build:web` next to the desktop app, unless `WEB_DIR` says where it is. */
const BUILT_WEB_DIR = resolve(import.meta.dirname, "../../desktop/dist/web")

/**
 * What the page may load and who may show it (ADR 0029). Everything comes from this
 * server; inline styles are allowed because the components set them, scripts are not.
 * No other site may put the page in a frame, so a click cannot be tricked out of it.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ")

const pageHeaders = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-frame-options": "DENY",
  "permissions-policy": "microphone=(self), camera=(), geolocation=()",
  // The page names its scripts by their content, so it is asked for again and the scripts never are.
  "cache-control": "no-cache"
}

const assetHeaders = { "cache-control": "public, max-age=31536000, immutable" }

/** Vite writes hashed names into one folder. Anything else, such as `..`, is not one of them. */
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const notFound = HttpServerResponse.text("Not found", { status: 404 })

/** A malformed escape, such as `%E0`, names no file rather than failing the request. */
const decodeName = (encoded: string) => {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return ""
  }
}

/** Sent with every answer: the browser takes types as given and tells no other site where it came from. */
export const SecurityHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.map(
      httpEffect,
      HttpServerResponse.setHeaders({ "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" })
    ),
  { global: true }
)

/** The browser interface at `/`, and its scripts, styles and fonts under `/assets/`. */
export const webRoutes = (dir: string) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      if (!existsSync(join(dir, "index.html"))) {
        yield* Effect.logWarning(
          `The web interface is not built, so / answers 404. Run pnpm build:web, or set WEB_DIR.`
        )
        yield* router.add(
          "GET",
          "/",
          HttpServerResponse.text("The web interface is not built. Run pnpm build:web.", { status: 404 })
        )
        return
      }

      yield* router.add(
        "GET",
        "/",
        HttpServerResponse.file(join(dir, "index.html")).pipe(
          Effect.map(HttpServerResponse.setHeaders(pageHeaders)),
          Effect.catch(() => Effect.succeed(notFound))
        )
      )

      yield* router.add(
        "GET",
        "/assets/*",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const path = request.url.split("?")[0] ?? ""
          const name = decodeName(path.slice("/assets/".length))
          if (!ASSET_NAME.test(name)) return notFound
          return yield* HttpServerResponse.file(join(dir, "assets", name)).pipe(
            Effect.map(HttpServerResponse.setHeaders(assetHeaders)),
            Effect.catch(() => Effect.succeed(notFound))
          )
        })
      )
    })
  )

/** Serves the built interface from `WEB_DIR`, or from where `pnpm build:web` puts it. An empty `WEB_DIR=` means the latter. */
export const WebRoutes = Layer.unwrap(
  Config.option(Config.String("WEB_DIR")).pipe(
    Effect.map((dir) =>
      webRoutes(
        Option.getOrElse(
          Option.filter(dir, (value) => value.trim() !== ""),
          () => BUILT_WEB_DIR
        )
      )
    )
  )
)
