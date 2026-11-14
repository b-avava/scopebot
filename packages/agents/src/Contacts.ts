import { Store } from "@scope-bot/db"
import { type Contact, type ContactDetails, ContactId, ContactNotFound, ReferenceNotFound } from "@scope-bot/domain"
import { Context, Effect, Layer, Option } from "effect"
import { nowIso } from "./Agents.ts"

/** The people and companies a business works with. Humans and, later, agents go through this service. */
export class Contacts extends Context.Service<
  Contacts,
  {
    readonly list: Effect.Effect<ReadonlyArray<Contact>>
    get(id: ContactId): Effect.Effect<Contact, ContactNotFound>
    create(details: ContactDetails): Effect.Effect<Contact, ReferenceNotFound>
    update(id: ContactId, details: ContactDetails): Effect.Effect<Contact, ContactNotFound | ReferenceNotFound>
    remove(id: ContactId): Effect.Effect<void, ContactNotFound>
  }
>()("@scope-bot/agents/Contacts") {
  static readonly layer = Layer.effect(
    Contacts,
    Effect.gen(function* () {
      const store = yield* Store

      const get = (id: ContactId) =>
        store.findContact(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ContactNotFound()),
              onSome: Effect.succeed
            })
          )
        )

      const validate = Effect.fn("Contacts.validate")(function* (details: ContactDetails) {
        const companyExists = details.companyId === null || Option.isSome(yield* store.findContact(details.companyId))
        const ownerExists = details.ownerId === null || Option.isSome(yield* store.findAgent(details.ownerId))
        if (!companyExists || !ownerExists) return yield* Effect.fail(new ReferenceNotFound())
      })

      return Contacts.of({
        list: store.contacts,
        get,
        create: Effect.fn("Contacts.create")(function* (details) {
          yield* validate(details)
          const contact: Contact = {
            ...details,
            id: ContactId.make(crypto.randomUUID()),
            summary: null,
            createdAt: yield* nowIso
          }
          yield* store.saveContact(contact)
          return contact
        }),
        update: Effect.fn("Contacts.update")(function* (id, details) {
          const existing = yield* get(id)
          yield* validate(details)
          const updated: Contact = { ...existing, ...details }
          yield* store.saveContact(updated)
          return updated
        }),
        remove: Effect.fn("Contacts.remove")(function* (id) {
          yield* get(id)
          yield* store.removeContact(id)
        })
      })
    })
  )
}
