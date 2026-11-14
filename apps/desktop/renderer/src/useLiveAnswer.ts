import { idleAnswer, type LiveAnswer } from "@scope-bot/domain"
import { useCallback, useEffect, useRef, useState } from "react"

/** How long to wait before asking a server that did not answer again. */
const RETRY_MS = 2000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Asks again as soon as the server answers, for as long as an answer is being
 * written or a question from this screen waits. Says whether it saw one written.
 */
const followToTheEnd = async (
  look: (version: number) => Promise<LiveAnswer | null | "done">,
  asking: () => boolean
) => {
  let version = -1
  let sawAnswer = false
  for (;;) {
    const answer = await look(version)
    if (answer === "done") return sawAnswer
    if (answer !== null) {
      version = answer.version
      sawAnswer ||= answer.status === "answering"
      if (answer.status !== "answering" && !asking()) return sawAnswer
    }
  }
}

/**
 * Follows the answer a chat's employee is writing (ADR 0025). The server holds
 * each question until something changed, so this asks again right away; when
 * the server is out of reach it says so and keeps trying.
 */
export const useLiveAnswer = (agentId: string, conversationId: string, onAnswered: () => void) => {
  const [live, setLive] = useState<LiveAnswer>(idleAnswer)
  const [lost, setLost] = useState(false)
  /** A question is being answered from this screen. */
  const asking = useRef(false)
  const following = useRef(false)
  const open = useRef(true)

  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  /** One look at the chat: its answer, null to try again after the server came back, or "done". */
  const look = useCallback(
    async (version: number): Promise<LiveAnswer | null | "done"> => {
      const result = await window.scopeBot.watchAnswer(agentId, conversationId, version)
      if (!open.current) return "done"
      if (result.ok) {
        setLost(false)
        setLive(result.value)
        return result.value
      }
      if (result.error !== "offline") return "done"
      setLost(true)
      await wait(RETRY_MS)
      return null
    },
    [agentId, conversationId]
  )

  const follow = useCallback(async () => {
    if (following.current) return
    following.current = true
    const sawAnswer = await followToTheEnd(look, () => asking.current)
    following.current = false
    // An answer that started elsewhere, or before the app lost the server, is in the chat now.
    if (sawAnswer && open.current) onAnswered()
  }, [look, onAnswered])

  // Opening a chat shows an answer still being written, or how the last one ended.
  useEffect(() => {
    void follow()
  }, [follow])

  /** Follows the chat while the question is being answered. */
  const during = async <A>(work: Promise<A>) => {
    asking.current = true
    void follow()
    try {
      return await work
    } finally {
      asking.current = false
    }
  }

  const stop = () => window.scopeBot.stopAnswer(agentId, conversationId)

  return { live, lost, during, stop }
}
