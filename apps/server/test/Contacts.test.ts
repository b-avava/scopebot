import { assert, layer } from "@effect/vitest"
import { Contacts } from "@scope-bot/agents"
import { Api } from "@scope-bot/contracts"
import { Store } from "@scope-bot/db"
import { type ContactDetails, ContactId, emptyContactDetails } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiTest } from "effect/http-api"
import { ContactsApiHandlers } from "../src/Http.ts"
import { TestAuthorization } from "./support.ts"

const handlers = ContactsApiHandlers.pipe(
  Layer.provide(TestAuthorization),
  Layer.provide(Contacts.layer),
  Layer.provide(Store.layerMemory)
)

const makeClient = HttpApiTest.groups(Api, ["contacts"])

const company: ContactDetails = {
  ...emptyContactDetails,
  kind: "company",
  name: "Northwind",
  channels: { phone: "", whatsapp: "", telegram: "@northwind" },
  consent: { messages: true, marketing: false }
}

layer(Layer.mergeAll(handlers, TestAuthorization, HttpServer.layerServices))("Contacts API", (it) => {
  it.effect("creates, changes and removes a contact", () =>
    Effect.gen(function* () {
      const client = yield* makeClient

      const created = yield* client.contacts.create({ payload: company })
      assert.strictEqual(created.name, "Northwind")

      const updated = yield* client.contacts.update({
        params: { id: created.id },
        payload: { ...company, name: "Northwind Ltd" }
      })
      assert.strictEqual(updated.name, "Northwind Ltd")
      assert.isTrue((yield* client.contacts.list()).some((contact) => contact.name === "Northwind Ltd"))

      yield* client.contacts.remove({ params: { id: created.id } })
      assert.isFalse((yield* client.contacts.list()).some((contact) => contact.id === created.id))
    })
  )

  it.effect("answers 404 for an unknown contact", () =>
    Effect.gen(function* () {
      const client = yield* makeClient
      const params = { id: ContactId.make("missing") }

      const failure = yield* client.contacts.update({ params, payload: company }).pipe(Effect.flip)

      assert.strictEqual(failure._tag, "ContactNotFound")
    })
  )
})
