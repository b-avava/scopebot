import { Instagram } from "@scope-bot/agents"
import { redirectPath, webhookPath } from "@scope-bot/integrations"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

const page = (title: string, text: string) =>
  HttpServerResponse.html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#242424;color:#fff}
main{max-width:420px;padding:24px;text-align:center}p{color:#b0b0b0;line-height:1.5}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body>
</html>`)

const params = (url: string) => new URL(url, "http://localhost").searchParams

/**
 * What Instagram calls without a session: its webhook and the end of the login.
 * The webhook trusts only bodies signed with the app secret, and the login only
 * a state this server handed out a moment ago.
 */
export const InstagramRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const instagram = yield* Instagram

    yield* router.add("GET", webhookPath, (request) =>
      Effect.sync(() => {
        const query = params(request.url)
        const challenge = instagram.verifyWebhook(
          query.get("hub.mode") ?? "",
          query.get("hub.verify_token") ?? "",
          query.get("hub.challenge") ?? ""
        )
        return Option.match(challenge, {
          onNone: () => HttpServerResponse.text("Forbidden", { status: 403 }),
          onSome: (value) => HttpServerResponse.text(value)
        })
      })
    )

    yield* router.add("POST", webhookPath, (request) =>
      Effect.gen(function* () {
        const body = yield* request.text.pipe(Effect.orElseSucceed(() => ""))
        const signature = request.headers["x-hub-signature-256"]
        const accepted = yield* instagram.receiveWebhook(body, signature)
        return accepted ? HttpServerResponse.text("ok") : HttpServerResponse.text("Forbidden", { status: 403 })
      })
    )

    yield* router.add("GET", redirectPath, (request) =>
      Effect.gen(function* () {
        const query = params(request.url)
        const result = yield* instagram.finishLogin(query.get("code") ?? "", query.get("state") ?? "")
        return result === "connected"
          ? page("Instagram is connected", "You can close this page and go back to Scope Bot.")
          : page("Instagram did not connect", "Go back to Scope Bot and try again. The reason is shown there.")
      })
    )
  })
)
