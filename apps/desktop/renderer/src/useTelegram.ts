import type { ChannelSettings, TelegramChat, TelegramStatus } from "@scope-bot/domain"
import { useCallback, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { errorMessage } from "./hooks.ts"
import { usePolling } from "./useWhatsApp.ts"

const STATUS_CHECK_MS = 10_000
const CHATS_CHECK_MS = 4_000
const BADGE_CHECK_MS = 15_000

export const useTelegram = () => {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.scopeBot.getTelegram()
    if (result.ok) setStatus(result.value)
  }, [])
  usePolling(refresh, STATUS_CHECK_MS)

  const act = async (call: () => Promise<BridgeResult<TelegramStatus>>) => {
    const result = await call()
    if (result.ok) setStatus(result.value)
    setError(result.ok ? null : errorMessage(result.error))
    return result.ok
  }

  return {
    status,
    error,
    refresh,
    saveSettings: (settings: ChannelSettings) => act(() => window.scopeBot.saveTelegramSettings(settings)),
    connect: (token: string) => act(() => window.scopeBot.connectTelegram(token)),
    disconnect: () => act(() => window.scopeBot.disconnectTelegram())
  }
}

export const useTelegramChats = (enabled: boolean) => {
  const [chats, setChats] = useState<ReadonlyArray<TelegramChat>>([])
  const reload = useCallback(async () => {
    const result = await window.scopeBot.listTelegramChats()
    if (result.ok) setChats(result.value)
  }, [])
  usePolling(reload, CHATS_CHECK_MS, enabled)
  return { chats, reload }
}

/** How many Telegram replies wait for a person, for the badge on the rail. */
export const useTelegramDrafts = (online: boolean) => {
  const [drafts, setDrafts] = useState(0)
  const load = useCallback(async () => {
    const result = await window.scopeBot.getTelegram()
    if (result.ok) setDrafts(result.value.drafts)
  }, [])
  usePolling(load, BADGE_CHECK_MS, online)
  return drafts
}
