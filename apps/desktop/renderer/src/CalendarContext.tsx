import {
  type Appointment,
  type CalendarSettings,
  defaultCalendarSettings,
  type Specialist,
  type SpecialistDetails
} from "@scope-bot/domain"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { BridgeResult } from "../../preload/bridge.ts"

const WAITING_POLL_MS = 30_000
const WAITING_DAYS = 90

const useCalendarData = (online: boolean) => {
  const [settings, setSettings] = useState<CalendarSettings>(defaultCalendarSettings)
  const [specialists, setSpecialists] = useState<ReadonlyArray<Specialist>>([])
  const [waiting, setWaiting] = useState<ReadonlyArray<Appointment>>([])
  const [loaded, setLoaded] = useState(false)

  const reloadWaiting = useCallback(async () => {
    const from = new Date()
    const to = new Date(from.getTime() + WAITING_DAYS * 24 * 3600000)
    const result = await window.scopeBot.listAppointments(from.toISOString(), to.toISOString())
    if (result.ok) setWaiting(result.value.filter((item) => item.status === "pending"))
  }, [])

  const reload = useCallback(async () => {
    const [nextSettings, nextSpecialists] = await Promise.all([
      window.scopeBot.getCalendarSettings(),
      window.scopeBot.listSpecialists()
    ])
    if (nextSettings.ok) setSettings(nextSettings.value)
    if (nextSpecialists.ok) setSpecialists(nextSpecialists.value)
    setLoaded(nextSettings.ok)
  }, [])

  useEffect(() => {
    if (online) void reload()
  }, [online, reload])

  useEffect(() => {
    if (!online || !settings.enabled) return
    void reloadWaiting()
    const timer = setInterval(() => void reloadWaiting(), WAITING_POLL_MS)
    return () => clearInterval(timer)
  }, [online, settings.enabled, reloadWaiting])

  const saveSettings = useCallback(async (next: CalendarSettings) => {
    const result = await window.scopeBot.saveCalendarSettings(next)
    if (result.ok) setSettings(result.value)
    return result
  }, [])

  const saveSpecialist = useCallback(
    async (details: SpecialistDetails, id: string | null): Promise<BridgeResult<Specialist>> => {
      const result =
        id === null
          ? await window.scopeBot.createSpecialist(details)
          : await window.scopeBot.updateSpecialist(id, details)
      if (result.ok) {
        setSpecialists((current) =>
          current.some((item) => item.id === result.value.id)
            ? current.map((item) => (item.id === result.value.id ? result.value : item))
            : [...current, result.value]
        )
      }
      return result
    },
    []
  )

  const removeSpecialist = useCallback(async (id: string) => {
    const result = await window.scopeBot.removeSpecialist(id)
    if (result.ok) setSpecialists((current) => current.filter((item) => item.id !== id))
    return result
  }, [])

  return useMemo(
    () => ({
      loaded,
      settings,
      specialists,
      waiting,
      reload,
      reloadWaiting,
      saveSettings,
      saveSpecialist,
      removeSpecialist
    }),
    [loaded, settings, specialists, waiting, reload, reloadWaiting, saveSettings, saveSpecialist, removeSpecialist]
  )
}

type CalendarData = ReturnType<typeof useCalendarData>

const CalendarContext = createContext<CalendarData | null>(null)

/** The calendar module of the business: whether it is on, its rules, and who takes appointments. */
export const CalendarProvider = ({ online, children }: { readonly online: boolean; readonly children: ReactNode }) => (
  <CalendarContext.Provider value={useCalendarData(online)}>{children}</CalendarContext.Provider>
)

export const useCalendar = () => {
  const value = useContext(CalendarContext)
  if (value === null) throw new Error("useCalendar needs a CalendarProvider")
  return value
}
