import type { ChannelSettings, InstagramChat, InstagramStatus } from "@scope-bot/domain"
import { useCallback, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"
import { errorMessage } from "./hooks.ts"
import { usePolling } from "./useWhatsApp.ts"

// The connection finishes in the browser, so the screen asks more often while it waits.
const STATUS_CHECK_MS = 5_000
const CHATS_CHECK_MS = 4_000
const BADGE_CHECK_MS = 15_000

export const useInstagram = () => {
  const [status, setStatus] = useState<InstagramStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.scopeBot.getInstagram()
    if (result.ok) setStatus(result.value)
  }, [])
  usePolling(refresh, STATUS_CHECK_MS)

  const act = async (call: () => Promise<BridgeResult<InstagramStatus>>) => {
    const result = await call()
    if (result.ok) setStatus(result.value)
    setError(result.ok ? null : errorMessage(result.error))
    return result.ok
  }

  return {
    status,
    error,
    refresh,
    saveSettings: (settings: ChannelSettings) => act(() => window.scopeBot.saveInstagramSettings(settings)),
    check: () => act(() => window.scopeBot.checkInstagram()),
    disconnect: () => act(() => window.scopeBot.disconnectInstagram()),
    login: async () => {
      const result = await window.scopeBot.startInstagramLogin()
      setError(result.ok ? null : errorMessage(result.error))
      return result.ok
    }
  }
}

export const useInstagramChats = (enabled: boolean) => {
  const [chats, setChats] = useState<ReadonlyArray<InstagramChat>>([])
  const reload = useCallback(async () => {
    const result = await window.scopeBot.listInstagramChats()
    if (result.ok) setChats(result.value)
  }, [])
  usePolling(reload, CHATS_CHECK_MS, enabled)
  return { chats, reload }
}

/** How many Instagram replies wait for a person, for the badge on the rail. */
export const useInstagramDrafts = (online: boolean) => {
  const [drafts, setDrafts] = useState(0)
  const load = useCallback(async () => {
    const result = await window.scopeBot.getInstagram()
    if (result.ok) setDrafts(result.value.drafts)
  }, [])
  usePolling(load, BADGE_CHECK_MS, online)
  return drafts
}
