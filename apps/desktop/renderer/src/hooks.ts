import type { Agent, AgentSettings, CreateAgent, ModelCatalog } from "@scope-bot/domain"
import { useCallback, useEffect, useState } from "react"
import type { BridgeError, BridgeResult, ServerStatus, Theme } from "../../preload/bridge.ts"

const POLL_INTERVAL_MS = 3000
const THEME_KEY = "scope-bot-theme"

const errorMessages: Record<BridgeError, string> = {
  offline: "The server is not reachable. Check that it is running.",
  invalid: "Some of the data is not valid.",
  "not-found": "This employee no longer exists.",
  paused: "This employee is paused. Turn them on in Settings.",
  "model-not-configured": "The AI model is not connected. Set LLM_API_KEY in .env and restart the server.",
  "model-refused": "The AI model declined to answer this message.",
  "model-failed": "The AI model did not answer. Try again in a moment."
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

  useEffect(() => {
    if (!online) return
    let active = true
    void window.scopeBot.listAgents().then((result) => {
      if (active && result.ok) setAgents(result.value)
    })
    return () => {
      active = false
    }
  }, [online])

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

  const remove = useCallback(async (id: string) => {
    const result = await window.scopeBot.removeAgent(id)
    if (result.ok) setAgents((current) => current.filter((agent) => agent.id !== id))
    return result
  }, [])

  return { agents, create, update, remove }
}

/** Null until the server answers. */
export const useModels = () => {
  const [result, setResult] = useState<BridgeResult<ModelCatalog> | null>(null)

  useEffect(() => {
    let active = true
    void window.scopeBot.listModels().then((next) => {
      if (active) setResult(next)
    })
    return () => {
      active = false
    }
  }, [])

  return result
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
