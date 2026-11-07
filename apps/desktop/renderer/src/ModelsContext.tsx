import type { ModelChoice, ProviderCatalog, ProviderPreferences } from "@scope-bot/domain"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react"

const noPreferences: ProviderPreferences = { defaultProvider: null, disabled: [], hiddenModels: [] }

interface Models {
  /** Null until the server answers. */
  readonly all: ReadonlyArray<ProviderCatalog> | null
  /** What the model picker offers: connected, switched on and not hidden. */
  readonly usable: ReadonlyArray<ProviderCatalog> | null
  readonly preferences: ProviderPreferences
  readonly reload: () => void
  readonly savePreferences: (preferences: ProviderPreferences) => void
  readonly openProviders: () => void
}

const ModelsContext = createContext<Models | null>(null)

export const useModels = () => {
  const models = useContext(ModelsContext)
  if (models === null) throw new Error("useModels must be used within ModelsProvider")
  return models
}

const isHidden = (preferences: ProviderPreferences, choice: ModelChoice) =>
  preferences.hiddenModels.some((item) => item.provider === choice.provider && item.model === choice.model)

const toUsable = (all: ReadonlyArray<ProviderCatalog>, preferences: ProviderPreferences) =>
  all
    .filter((provider) => provider.status === "connected" && !preferences.disabled.includes(provider.id))
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) => !isHidden(preferences, { provider: provider.id, model: model.id }))
    }))

interface ModelsProviderProps {
  readonly online: boolean
  readonly onOpenProviders: () => void
  readonly children: ReactNode
}

export const ModelsProvider = ({ online, onOpenProviders, children }: ModelsProviderProps) => {
  const [all, setAll] = useState<ReadonlyArray<ProviderCatalog> | null>(null)
  const [preferences, setPreferences] = useState(noPreferences)

  const reload = useCallback(() => {
    void window.scopeBot.listModels().then((result) => setAll(result.ok ? result.value : []))
  }, [])

  useEffect(() => {
    if (!online) return
    reload()
    void window.scopeBot.getPreferences().then((result) => {
      if (result.ok) setPreferences(result.value)
    })
  }, [online, reload])

  const savePreferences = useCallback((next: ProviderPreferences) => {
    setPreferences(next)
    void window.scopeBot.savePreferences(next)
  }, [])

  const value = useMemo(
    () => ({
      all,
      usable: all === null ? null : toUsable(all, preferences),
      preferences,
      reload,
      savePreferences,
      openProviders: onOpenProviders
    }),
    [all, preferences, reload, savePreferences, onOpenProviders]
  )

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>
}
