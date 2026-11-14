import {
  type AgentAction,
  type ConversationId,
  idleAnswer,
  LIVE_WAIT_SECONDS,
  type LiveAnswer,
  type MessageId,
  shownSoFar
} from "@scope-bot/domain"
import { Cause, Context, Effect, Exit, Fiber, Layer, Option, Stream, SubscriptionRef } from "effect"
import { nowIso } from "./Agents.ts"

/** What became of an answer that ran to its end, or that a person stopped. */
export type Finished<A> = { readonly stopped: false; readonly value: A } | { readonly stopped: true }

/**
 * Answers in chats with the team as they are written (ADR 0025). An answer
 * runs on its own fiber, so it goes on when the app that asked goes away, and
 * a person can stop it. What it shows lives in memory only.
 */
export class LiveAnswers extends Context.Service<
  LiveAnswers,
  {
    /** The chat's answer now, or as soon as it is newer than `after`, waiting a little at most. */
    watch(conversationId: ConversationId, after: number): Effect.Effect<LiveAnswer>
    /** Runs one answer of a chat to its end, unless a person stops it. One at a time per chat. */
    run<A, E>(
      conversationId: ConversationId,
      questionId: MessageId,
      answer: Effect.Effect<A, E>
    ): Effect.Effect<Finished<A>, E>
    /** The reply so far, as the model writes it. Starts over for each model and each round of tools. */
    write(conversationId: ConversationId, soFar: string): Effect.Effect<void>
    /** What the employee did so far for this answer. */
    did(conversationId: ConversationId, steps: ReadonlyArray<AgentAction>): Effect.Effect<void>
    /** Whether the chat is answering now. */
    answering(conversationId: ConversationId): Effect.Effect<boolean>
    /** Stops the chat's answer. Steps already done stay done. */
    stop(conversationId: ConversationId): Effect.Effect<void>
  }
>()("@scope-bot/agents/LiveAnswers") {
  static readonly layer = Layer.sync(LiveAnswers, () => {
    const states = new Map<ConversationId, SubscriptionRef.SubscriptionRef<LiveAnswer>>()
    const fibers = new Map<ConversationId, Fiber.Fiber<unknown, unknown>>()

    const stateOf = (id: ConversationId) =>
      Effect.suspend(() => {
        const known = states.get(id)
        if (known !== undefined) return Effect.succeed(known)
        return SubscriptionRef.make(idleAnswer).pipe(Effect.tap((ref) => Effect.sync(() => states.set(id, ref))))
      })

    const change = (id: ConversationId, next: (current: LiveAnswer) => LiveAnswer) =>
      stateOf(id).pipe(
        Effect.flatMap((ref) =>
          SubscriptionRef.update(ref, (current) => ({ ...next(current), version: current.version + 1 }))
        )
      )

    /** Changes only an answer that is still going, so a late piece of text never undoes the end. */
    const whileAnswering = (id: ConversationId, next: (current: LiveAnswer) => LiveAnswer) =>
      change(id, (current) => (current.status === "answering" ? next(current) : current))

    /** A saved answer leaves nothing to show; a stopped or broken one keeps what came. */
    const finish = (id: ConversationId, exit: Exit.Exit<unknown, unknown>) =>
      change(id, (current) => {
        if (Exit.isSuccess(exit)) return { ...current, status: "idle", text: "", steps: [] }
        const stopped = Cause.hasInterruptsOnly(exit.cause)
        if (!stopped && current.text === "") return { ...current, status: "idle", steps: [] }
        return { ...current, status: stopped ? "stopped" : "broke" }
      }).pipe(Effect.andThen(Effect.sync(() => fibers.delete(id))))

    return LiveAnswers.of({
      watch: (id, after) =>
        stateOf(id).pipe(
          Effect.flatMap((ref) =>
            SubscriptionRef.changes(ref).pipe(
              Stream.filter((state) => state.version > after),
              Stream.runHead,
              Effect.timeout(`${LIVE_WAIT_SECONDS} seconds`),
              Effect.orElseSucceed(() => Option.none<LiveAnswer>()),
              Effect.flatMap(Option.match({ onNone: () => SubscriptionRef.get(ref), onSome: Effect.succeed }))
            )
          )
        ),
      run: (id, questionId, answer) =>
        Effect.gen(function* () {
          const startedAt = yield* nowIso
          yield* change(id, () => ({ ...idleAnswer, status: "answering", questionId, startedAt }))
          // Detached from the request: closing the app does not stop the answer, only a person does.
          const fiber = yield* answer.pipe(
            Effect.onExit((exit) => finish(id, exit)),
            Effect.forkDetach
          )
          fibers.set(id, fiber)
          const exit = yield* Fiber.await(fiber)
          if (Exit.isSuccess(exit)) return { stopped: false, value: exit.value } as const
          if (Cause.hasInterruptsOnly(exit.cause)) return { stopped: true } as const
          return yield* Effect.failCause(exit.cause)
        }),
      write: (id, soFar) => whileAnswering(id, (current) => ({ ...current, text: shownSoFar(soFar) })),
      did: (id, steps) => whileAnswering(id, (current) => ({ ...current, steps })),
      answering: (id) => Effect.sync(() => fibers.has(id)),
      stop: (id) =>
        Effect.suspend(() => {
          const fiber = fibers.get(id)
          return fiber === undefined ? Effect.void : Fiber.interrupt(fiber)
        })
    })
  })
}
