import type { Agent, AgentSettings, ConversationSummary, CreateAgent, LastMessage } from "@scope-bot/domain"
import { useCallback, useEffect, useState } from "react"
import type { BridgeError, ServerStatus, Theme } from "../../preload/bridge.ts"

const POLL_INTERVAL_MS = 3000
const THEME_KEY = "scope-bot-theme"

const errorMessages: Record<BridgeError, string> = {
  offline: "The server is not reachable. Check that it is running.",
  invalid: "Some of the data is not valid.",
  "not-found": "This employee no longer exists.",
  paused: "This employee is paused. Turn them on in Settings.",
  "model-not-configured": "The AI model is not connected. Pick a connected one in this employee's settings.",
  "model-refused": "The AI model declined to answer this message.",
  "model-failed": "The AI model did not answer. Try again in a moment.",
  "provider-login-failed": "The sign in did not finish. Try again, or sign in from a terminal."
}

export const errorMessage = (error: BridgeError) => errorMessages[error]

export const useServerStatus = () => {
  const [status, setStatus] = useState<ServerStatus | null>(null)

  useEffect(() => {
    let active = true
    const refresh = () => {
      void window.scopeBot.getServerStatus().then((next) => {
        if (active) setStatus(next)
      })
    }

    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  return status
}

export const useAgents = (online: boolean) => {
  const [agents, setAgents] = useState<ReadonlyArray<Agent>>([])
  const [lastMessages, setLastMessages] = useState<ReadonlyArray<LastMessage>>([])

  const reloadLastMessages = useCallback(() => {
    void window.scopeBot.listLastMessages().then((result) => {
      if (result.ok) setLastMessages(result.value)
    })
  }, [])

  useEffect(() => {
    if (!online) return
    let active = true
    void window.scopeBot.listAgents().then((result) => {
      if (active && result.ok) setAgents(result.value)
    })
    reloadLastMessages()
    return () => {
      active = false
    }
  }, [online, reloadLastMessages])

  const create = useCallback(async (input: CreateAgent) => {
    const result = await window.scopeBot.createAgent(input)
    if (result.ok) setAgents((current) => [...current, result.value])
    return result
  }, [])

  const update = useCallback(async (id: string, settings: AgentSettings) => {
    const result = await window.scopeBot.updateAgent(id, settings)
    if (result.ok) {
      setAgents((current) => current.map((agent) => (agent.id === id ? result.value : agent)))
    }
    return result
  }, [])

  const pin = useCallback(async (id: string, pinned: boolean) => {
    const result = await window.scopeBot.pinAgent(id, pinned)
    if (result.ok) {
      setAgents((current) => current.map((agent) => (agent.id === id ? result.value : agent)))
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    const result = await window.scopeBot.removeAgent(id)
    if (result.ok) setAgents((current) => current.filter((agent) => agent.id !== id))
    return result
  }, [])

  return { agents, lastMessages, reloadLastMessages, create, update, pin, remove }
}

/** The tabs of one employee. */
export const useConversations = (agentId: string) => {
  const [tabs, setTabs] = useState<ReadonlyArray<ConversationSummary>>([])
  const [selected, setSelected] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const result = await window.scopeBot.listConversations(agentId)
    if (result.ok) setTabs(result.value)
  }, [agentId])

  useEffect(() => {
    void reload()
  }, [reload])

  const create = async () => {
    const result = await window.scopeBot.createConversation(agentId)
    if (!result.ok) return
    await reload()
    setSelected(result.value.id)
  }

  const rename = async (id: string, title: string) => {
    await window.scopeBot.renameConversation(agentId, id, title)
    await reload()
  }

  const remove = async (id: string) => {
    const result = await window.scopeBot.removeConversation(agentId, id)
    if (!result.ok) return
    if (selected === id) setSelected(tabs.find((tab) => tab.id !== id)?.id ?? null)
    await reload()
  }

  const activeId = tabs.some((tab) => tab.id === selected) ? selected : (tabs[0]?.id ?? null)

  return { tabs, activeId, select: setSelected, create, rename, remove, reload }
}

const readTheme = (): Theme => {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"
  } catch {
    return "light"
  }
}

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    void window.scopeBot.setTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // The choice simply will not survive a restart.
    }
  }, [theme])

  return { theme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") }
}
