import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeHttpServer } from "@effect/platform-node"
import { afterAll, assert, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient, HttpRouter } from "effect/http"
import { SecurityHeaders, webRoutes } from "../src/WebRoutes.ts"

// A stand-in for what `pnpm build:web` writes, with a file next to it that must stay out of reach.
const built = mkdtempSync(join(tmpdir(), "scope-bot-web-"))
mkdirSync(join(built, "assets"))
writeFileSync(join(built, "index.html"), "<!doctype html><title>Scope Bot</title>")
writeFileSync(join(built, "assets", "index-Ab12.js"), "export {}")
writeFileSync(join(built, "assets", "index-Cd34.css"), "body{}")
writeFileSync(join(built, "secret.txt"), "not for the browser")

afterAll(() => rmSync(built, { recursive: true, force: true }))

const serve = (dir: string) =>
  HttpRouter.serve(Layer.mergeAll(webRoutes(dir), SecurityHeaders), {
    disableListenLog: true,
    disableLogger: true
  }).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

layer(serve(built), { excludeTestServices: true })("Web interface", (it) => {
  it.effect("serves the page with headers that keep other sites out of it", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const page = yield* http.get("/")

      assert.strictEqual(page.status, 200)
      assert.include(page.headers["content-type"], "text/html")
      assert.strictEqual(yield* page.text, "<!doctype html><title>Scope Bot</title>")
      const policy = page.headers["content-security-policy"] ?? ""
      assert.include(policy, "frame-ancestors 'none'")
      assert.include(policy, "script-src 'self'")
      assert.notInclude(policy, "unsafe-eval")
      assert.strictEqual(page.headers["x-frame-options"], "DENY")
      assert.strictEqual(page.headers["x-content-type-options"], "nosniff")
      assert.strictEqual(page.headers["referrer-policy"], "no-referrer")
      assert.strictEqual(page.headers["cache-control"], "no-cache")
    })
  )

  it.effect("serves hashed assets with their types, cached for good", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const script = yield* http.get("/assets/index-Ab12.js")
      const style = yield* http.get("/assets/index-Cd34.css")

      assert.deepStrictEqual([script.status, style.status], [200, 200])
      assert.include(script.headers["content-type"], "javascript")
      assert.include(style.headers["content-type"], "text/css")
      assert.strictEqual(script.headers["cache-control"], "public, max-age=31536000, immutable")
    })
  )

  it.effect("serves nothing outside the assets folder", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const statuses = yield* Effect.forEach(
        ["/assets/missing.js", "/assets/..%2Fsecret.txt", "/assets/%2E%2E%2Fsecret.txt", "/assets/%E0", "/secret.txt"],
        (path) => http.get(path).pipe(Effect.map((response) => response.status))
      )
      assert.deepStrictEqual(statuses, [404, 404, 404, 404, 404])
    })
  )
})

layer(serve(join(built, "not-built")), { excludeTestServices: true })("Web interface, not built", (it) => {
  it.effect("says how to build it instead of failing", () =>
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const page = yield* http.get("/")
      assert.strictEqual(page.status, 404)
      assert.include(yield* page.text, "pnpm build:web")
    })
  )
})
