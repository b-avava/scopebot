import type { ChatMessage, WhatsAppChat, WhatsAppSettings, WhatsAppStatus } from "@scope-bot/domain"
import { useCallback, useEffect, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { errorMessage } from "./hooks.ts"

// Messages arrive on the server, so the screen asks again now and then.
const LINKING_CHECK_MS = 2_000
const STATUS_CHECK_MS = 10_000
const CHATS_CHECK_MS = 4_000
const MESSAGES_CHECK_MS = 3_000
const BADGE_CHECK_MS = 15_000

/** Runs `load` now and then while `enabled`, and once whenever it changes. */
export const usePolling = (load: () => Promise<void>, everyMs: number, enabled = true) => {
  useEffect(() => {
    if (!enabled) return
    void load()
    const timer = setInterval(() => void load(), everyMs)
    return () => clearInterval(timer)
  }, [load, everyMs, enabled])
}

export const useWhatsApp = () => {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.scopeBot.getWhatsApp()
    if (result.ok) setStatus(result.value)
  }, [])
  usePolling(refresh, status?.state === "linking" ? LINKING_CHECK_MS : STATUS_CHECK_MS)

  const act = async (call: () => Promise<BridgeResult<WhatsAppStatus>>) => {
    const result = await call()
    if (result.ok) setStatus(result.value)
    setError(result.ok ? null : errorMessage(result.error))
    return result.ok
  }

  return {
    status,
    error,
    refresh,
    saveSettings: (settings: WhatsAppSettings) => act(() => window.scopeBot.saveWhatsAppSettings(settings)),
    link: (phone: string | null) => act(() => window.scopeBot.linkWhatsApp(phone)),
    cancel: () => act(() => window.scopeBot.cancelWhatsAppLink()),
    unlink: () => act(() => window.scopeBot.unlinkWhatsApp())
  }
}

export const useWhatsAppChats = (enabled: boolean) => {
  const [chats, setChats] = useState<ReadonlyArray<WhatsAppChat>>([])
  const reload = useCallback(async () => {
    const result = await window.scopeBot.listWhatsAppChats()
    if (result.ok) setChats(result.value)
  }, [])
  usePolling(reload, CHATS_CHECK_MS, enabled)
  return { chats, reload }
}

/** The messages of one chat on any channel, asked for again now and then. */
export const useChannelMessages = (
  list: (chatId: string) => Promise<BridgeResult<ReadonlyArray<ChatMessage>>>,
  chatId: string | null
) => {
  const [messages, setMessages] = useState<ReadonlyArray<ChatMessage>>([])
  const reload = useCallback(async () => {
    if (chatId === null) return
    const result = await list(chatId)
    if (result.ok) setMessages(result.value)
  }, [list, chatId])
  usePolling(reload, MESSAGES_CHECK_MS, chatId !== null)
  return { messages, reload }
}

/** How many replies wait for a person, for the badge on the rail. */
export const useWhatsAppDrafts = (online: boolean) => {
  const [drafts, setDrafts] = useState(0)
  const load = useCallback(async () => {
    const result = await window.scopeBot.getWhatsApp()
    if (result.ok) setDrafts(result.value.drafts)
  }, [])
  usePolling(load, BADGE_CHECK_MS, online)
  return drafts
}
