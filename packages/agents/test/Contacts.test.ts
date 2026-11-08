import { assert, describe, it } from "@effect/vitest"
import { Store } from "@scope-bot/db"
import { type ContactDetails, ContactId, ContactNotFound, emptyContactDetails } from "@scope-bot/domain"
import { Effect, Layer } from "effect"
import { Contacts } from "../src/Contacts.ts"

const services = Contacts.layer.pipe(Layer.provide(Store.layerMemory))

const anna: ContactDetails = {
  ...emptyContactDetails,
  name: "Anna",
  channels: { phone: "+995 555 12 34 56", whatsapp: "", telegram: "" }
}

describe("Contacts", () => {
  it.effect("creates a contact with its own id and time", () =>
    Effect.gen(function* () {
      const contacts = yield* Contacts

      const created = yield* contacts.create(anna)

      assert.strictEqual(created.name, "Anna")
      assert.isNotEmpty(created.id)
      assert.deepStrictEqual(yield* contacts.get(created.id), created)
    }).pipe(Effect.provide(services))
  )

  it.effect("changes the details and keeps the id and creation time", () =>
    Effect.gen(function* () {
      const contacts = yield* Contacts
      const created = yield* contacts.create(anna)

      const updated = yield* contacts.update(created.id, {
        ...anna,
        kind: "company",
        name: "Anna Ltd",
        consent: { messages: true, marketing: false }
      })

      assert.strictEqual(updated.id, created.id)
      assert.strictEqual(updated.createdAt, created.createdAt)
      assert.deepStrictEqual(yield* contacts.list, [updated])
    }).pipe(Effect.provide(services))
  )

  it.effect("removes only the chosen contact", () =>
    Effect.gen(function* () {
      const contacts = yield* Contacts
      const first = yield* contacts.create(anna)
      const second = yield* contacts.create({ ...anna, name: "Giorgi" })

      yield* contacts.remove(first.id)

      assert.deepStrictEqual(yield* contacts.list, [second])
    }).pipe(Effect.provide(services))
  )

  it.effect("fails for a contact that does not exist", () =>
    Effect.gen(function* () {
      const contacts = yield* Contacts
      const missing = ContactId.make("missing")

      assert.instanceOf(yield* contacts.get(missing).pipe(Effect.flip), ContactNotFound)
      assert.instanceOf(yield* contacts.update(missing, anna).pipe(Effect.flip), ContactNotFound)
      assert.instanceOf(yield* contacts.remove(missing).pipe(Effect.flip), ContactNotFound)
      assert.deepStrictEqual(yield* contacts.list, [])
    }).pipe(Effect.provide(services))
  )
})
