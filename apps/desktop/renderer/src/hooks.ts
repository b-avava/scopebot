import type {
  Account,
  Agent,
  AgentSettings,
  AgentState,
  ConversationSummary,
  CreateAgent,
  Department,
  DepartmentDetails,
  LastMessage
} from "@scope-bot/domain"
import { useCallback, useEffect, useState } from "react"
import type { BridgeError, ServerStatus, Theme } from "../../preload/bridge.ts"

const POLL_INTERVAL_MS = 3000
const SESSION_CHECK_MS = 30000
const STATE_CHECK_MS = 30000

type SessionState =
  | { readonly status: "loading" }
  | { readonly status: "signed-out" }
  | { readonly status: "signed-in"; readonly account: Account }
const THEME_KEY = "scope-bot-theme"

const errorMessages: Record<BridgeError, string> = {
  offline: "The server is not reachable. Check that it is running.",
  invalid: "Some of the data is not valid.",
  "not-found": "This employee no longer exists.",
  "contact-not-found": "This contact no longer exists.",
  "department-not-found": "This department no longer exists.",
  "deal-not-found": "This deal no longer exists.",
  gone: "This no longer exists. Reopen the screen.",
  "stage-in-use": "A stage with deals in it cannot be removed. Move the deals first.",
  "pipeline-invalid": "A funnel needs at least one open stage, one won stage and one lost stage.",
  paused: "This employee is paused. Turn them on in Settings.",
  "model-not-configured": "The AI model is not connected. Pick a connected one in this employee's settings.",
  "model-refused": "The AI model declined to answer this message.",
  "model-failed": "The AI model did not answer. Try again in a moment.",
  "provider-login-failed": "The sign in did not finish. Try again, or sign in from a terminal.",
  "signed-out": "Your session ended. Sign in again.",
  "wrong-credentials": "The email or the password is wrong.",
  "too-many-attempts": "Too many wrong passwords. Try again in 15 minutes.",
  "email-taken": "This email already has an account. Sign in instead.",
  forbidden: "Only the owner or an admin can do this.",
  "invite-invalid": "This invite is not valid. It may be used or expired, so ask for a new one.",
  "whatsapp-not-linked": "WhatsApp is not connected right now. Wait a moment, or link the number again.",
  "whatsapp-needs-agent": "Choose the employee who answers first.",
  "whatsapp-send-failed": "WhatsApp did not take the message. Try again in a moment.",
  "telegram-token-invalid": "Telegram does not know this token. Copy it again from @BotFather.",
  "telegram-not-connected": "The Telegram bot is not connected. Connect it in Settings.",
  "telegram-needs-agent": "Choose the employee who answers first.",
  "telegram-send-failed": "Telegram did not take the message. Try again in a moment.",
  "instagram-not-configured": "Instagram is not set up on this server yet. It needs a Meta app and a public address.",
  "instagram-not-connected": "Instagram is not connected. Connect it in Settings.",
  "instagram-needs-agent": "Choose the employee who answers first.",
  "instagram-window-closed": "Instagram no longer lets the business answer this chat. The customer has to write again.",
  "instagram-send-failed": "Instagram did not take the message. Try again in a moment.",
  "calendar-off": "The calendar is off. Turn it on in Business, Features.",
  "time-taken": "This time was just taken. Pick another one.",
  "time-unavailable": "This time cannot be booked: it is outside the hours, on a day off, or too soon.",
  "appointment-closed": "This appointment has already changed. Reopen it.",
  "cannot-answer-again": "Only the last question in your own chat can be answered again.",
  "too-many-rules": "An employee follows up to 30 rules. Turn one off or delete one first.",
  "voice-not-configured": "Speaking needs an ElevenLabs key. An owner or admin adds it in Providers.",
  "voice-failed": "ElevenLabs didn't answer, or didn't accept the key. Try again, or check the key in Providers.",
  "voice-key-rejected": "ElevenLabs didn't accept the key. An owner or admin checks it in Providers.",
  "nothing-heard": "Couldn't make out any words in the recording."
}

export const errorMessage = (error: BridgeError) => errorMessages[error]

/** Checks now and then, so a session that ended on the server closes the app here too. */
export const useSession = () => {
  const [state, setState] = useState<SessionState>({ status: "loading" })

  const refresh = useCallback(async () => {
    const result = await window.scopeBot.getAccount()
    if (result.ok) {
      setState(result.value === null ? { status: "signed-out" } : { status: "signed-in", account: result.value })
    } else {
      // An unreachable server says nothing about the session, so an open app stays open.
      setState((current) => (current.status === "loading" ? { status: "signed-out" } : current))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), SESSION_CHECK_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return {
    state,
    signedIn: (account: Account) => setState({ status: "signed-in", account }),
    signOut: async () => {
      await window.scopeBot.logout()
      setState({ status: "signed-out" })
    }
  }
}

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
  const [states, setStates] = useState<ReadonlyMap<string, AgentState>>(new Map())

  const reload = useCallback(() => {
    void window.scopeBot.listAgents().then((result) => {
      if (result.ok) setAgents(result.value)
    })
  }, [])

  const reloadStates = useCallback(() => {
    void window.scopeBot.listAgentStatuses().then((result) => {
      if (result.ok) setStates(new Map(result.value.map((status) => [status.agentId, status.state])))
    })
  }, [])

  // A chat changes what employees are doing, for example when a person takes one over.
  const reloadLastMessages = useCallback(() => {
    void window.scopeBot.listLastMessages().then((result) => {
      if (result.ok) setLastMessages(result.value)
    })
    reloadStates()
  }, [reloadStates])

  // Working hours begin and end on their own, so states are asked for again now and then.
  useEffect(() => {
    if (!online) return
    const timer = setInterval(reloadStates, STATE_CHECK_MS)
    return () => clearInterval(timer)
  }, [online, reloadStates])

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

  return { agents, lastMessages, states, reload, reloadLastMessages, create, update, pin, remove }
}

export const useDepartments = (online: boolean) => {
  const [departments, setDepartments] = useState<ReadonlyArray<Department>>([])

  useEffect(() => {
    if (!online) return
    let active = true
    void window.scopeBot.listDepartments().then((result) => {
      if (active && result.ok) setDepartments(result.value)
    })
    return () => {
      active = false
    }
  }, [online])

  const create = useCallback(async (details: DepartmentDetails) => {
    const result = await window.scopeBot.createDepartment(details)
    if (result.ok) setDepartments((current) => [...current, result.value])
    return result
  }, [])

  const update = useCallback(async (id: string, details: DepartmentDetails) => {
    const result = await window.scopeBot.updateDepartment(id, details)
    if (result.ok) {
      setDepartments((current) => current.map((department) => (department.id === id ? result.value : department)))
    }
    return result
  }, [])

  const remove = useCallback(async (id: string) => {
    const result = await window.scopeBot.removeDepartment(id)
    if (result.ok) setDepartments((current) => current.filter((department) => department.id !== id))
    return result
  }, [])

  return { departments, create, update, remove }
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
