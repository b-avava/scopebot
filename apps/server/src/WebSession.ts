import { SESSION_COOKIE, sessionCookie } from "@scope-bot/contracts"
import { Config, Effect, Option } from "effect"
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"

type Request = HttpServerRequest.HttpServerRequest

const header = (request: Request, name: string): string | undefined => {
  const value = request.headers[name]
  return typeof value === "string" ? value : undefined
}

/** Through a proxy only `X-Forwarded-Proto` tells; this server itself speaks plain HTTP. */
const cameOverHttps = (request: Request) =>
  header(request, "x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() === "https"

/** Over plain HTTP a browser refuses a `Secure` cookie, and the session is in the clear anyway (ADR 0029). */
const cookieOptions = (request: Request) => ({
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/",
  secure: cameOverHttps(request)
})

/** Puts the session into the cookie of the browser that made this request. */
export const setSessionCookie = (token: string, expires: Date) =>
  HttpServerRequest.HttpServerRequest.pipe(
    Effect.flatMap((request) =>
      HttpApiBuilder.securitySetCookie(sessionCookie, token, { ...cookieOptions(request), expires })
    )
  )

/** Deletes the cookie. Harmless for the desktop app, which has none. */
export const expireSessionCookie = HttpEffect.appendPreResponseHandler((request, response) =>
  HttpServerResponse.expireCookie(SESSION_COOKIE, cookieOptions(request))(response).pipe(Effect.orDie)
)

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * True when a browser request with the session could come from a page of another site.
 * Only requests that change something carry the risk, and signing in from a browser,
 * where there is no cookie yet but a forced sign-in would still harm.
 */
export const isCrossSite = (request: Request, publicOrigin: string | null) => {
  const path = request.url.split("?")[0] ?? ""
  const changes = !SAFE_METHODS.has(request.method.toUpperCase())
  const guarded = path.startsWith("/auth/web/") || (changes && request.cookies[SESSION_COOKIE] !== undefined)
  if (!guarded) return false

  const origin = header(request, "origin")
  if (origin !== undefined) {
    const host = header(request, "host")
    const sent = originOf(origin)
    if (sent === null) return true
    return new URL(sent).host !== host && sent !== publicOrigin
  }
  // Older browsers send no Origin on some requests, but they do tell where a request came from.
  const site = header(request, "sec-fetch-site")
  return site !== undefined && site !== "same-origin" && site !== "none"
}

/** Refuses requests that a page of another site made with the session (ADR 0029). */
export const CrossSiteGuard = HttpRouter.middleware(
  Effect.gen(function* () {
    const publicUrl = yield* Config.option(Config.String("PUBLIC_URL"))
    const publicOrigin = Option.match(publicUrl, { onNone: () => null, onSome: originOf })
    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        if (isCrossSite(request, publicOrigin)) {
          return HttpServerResponse.jsonUnsafe({ _tag: "CrossSiteRequest" }, { status: 403 })
        }
        return yield* httpEffect
      })
  }),
  { global: true }
)
