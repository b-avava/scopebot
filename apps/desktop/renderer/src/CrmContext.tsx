import type {
  Activity,
  ActivityPatch,
  Agent,
  ApprovalDecision,
  ApprovalRequest,
  Contact,
  ContactDetails,
  Deal,
  DealDetails,
  NewActivity,
  Pipeline,
  PipelineDetails,
  Service,
  ServiceDetails
} from "@scope-bot/domain"
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react"
import type { BridgeError, BridgeResult } from "../../preload/bridge.ts"

type List<A> = ReadonlyArray<A>
type Set<A> = Dispatch<SetStateAction<List<A>>>

const put = <A extends { readonly id: string }>(items: List<A>, item: A) =>
  items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item]

/** Applies a successful result to the list and hands the result back. */
const keep =
  <A extends { readonly id: string }>(set: Set<A>) =>
  (result: BridgeResult<A>) => {
    if (result.ok) set((current) => put(current, result.value))
    return result
  }

const drop =
  <A extends { readonly id: string }>(set: Set<A>, id: string) =>
  (result: BridgeResult<void>) => {
    if (result.ok) set((current) => current.filter((item) => item.id !== id))
    return result
  }

const useCrmData = (online: boolean) => {
  const [contacts, setContacts] = useState<List<Contact>>([])
  const [deals, setDeals] = useState<List<Deal>>([])
  const [pipelines, setPipelines] = useState<List<Pipeline>>([])
  const [services, setServices] = useState<List<Service>>([])
  const [activities, setActivities] = useState<List<Activity>>([])
  const [approvals, setApprovals] = useState<List<ApprovalRequest>>([])
  const [currency, setCurrency] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [failure, setFailure] = useState<BridgeError | null>(null)

  const reloadActivities = useCallback(async () => {
    const result = await window.scopeBot.listActivities()
    if (result.ok) setActivities(result.value)
  }, [])

  const reload = useCallback(async () => {
    const bridge = window.scopeBot
    const take = async <A,>(request: Promise<BridgeResult<A>>, set: (value: A) => void) => {
      const result = await request
      if (result.ok) set(result.value)
      return result.ok ? null : result.error
    }
    const errors = await Promise.all([
      take(bridge.listContacts(), setContacts),
      take(bridge.listDeals(), setDeals),
      take(bridge.listPipelines(), setPipelines),
      take(bridge.listServices(), setServices),
      take(bridge.listActivities(), setActivities),
      take(bridge.listApprovals(), setApprovals),
      take(bridge.getBusiness(), (business) => setCurrency(business.currency))
    ])
    setFailure(errors.find((error) => error !== null) ?? null)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (online) void reload()
  }, [online, reload])

  const actions = useMemo(() => {
    const bridge = window.scopeBot
    return {
      saveContact: async (details: ContactDetails, id: string | null) =>
        keep(setContacts)(await (id === null ? bridge.createContact(details) : bridge.updateContact(id, details))),
      /** Other records point at contacts, so everything is read again. */
      removeContact: async (id: string) => {
        const result = await bridge.removeContact(id)
        if (result.ok) await reload()
        return result
      },
      summarizeContact: async (id: string) => keep(setContacts)(await bridge.summarizeContact(id)),
      saveDeal: async (details: DealDetails, id: string | null) => {
        const result = keep(setDeals)(await (id === null ? bridge.createDeal(details) : bridge.updateDeal(id, details)))
        await reloadActivities()
        return result
      },
      removeDeal: async (id: string) => {
        const result = await bridge.removeDeal(id)
        if (result.ok) await reload()
        return result
      },
      savePipeline: async (id: string, details: PipelineDetails) =>
        keep(setPipelines)(await bridge.updatePipeline(id, details)),
      saveService: async (details: ServiceDetails, id: string | null) =>
        keep(setServices)(await (id === null ? bridge.createService(details) : bridge.updateService(id, details))),
      removeService: async (id: string) => {
        const result = await bridge.removeService(id)
        if (result.ok) await reload()
        return result
      },
      addActivity: async (input: NewActivity) => keep(setActivities)(await bridge.createActivity(input)),
      patchActivity: async (id: string, patch: ActivityPatch) =>
        keep(setActivities)(await bridge.updateActivity(id, patch)),
      removeActivity: async (id: string) => drop(setActivities, id)(await bridge.removeActivity(id)),
      decideApproval: async (id: string, decision: ApprovalDecision) => {
        const result = keep(setApprovals)(await bridge.decideApproval(id, decision))
        await reloadActivities()
        return result
      }
    }
  }, [reload, reloadActivities])

  return { contacts, deals, pipelines, services, activities, approvals, currency, loaded, failure, reload, ...actions }
}

type Crm = ReturnType<typeof useCrmData> & {
  readonly agents: List<Agent>
  readonly online: boolean
}

const CrmContext = createContext<Crm | null>(null)

/** The CRM records, read once and shared by the screens. */
export const CrmProvider = ({
  online,
  agents,
  children
}: {
  readonly online: boolean
  readonly agents: List<Agent>
  readonly children: ReactNode
}) => {
  const data = useCrmData(online)
  const value = useMemo(() => ({ ...data, agents, online }), [data, agents, online])
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export const useCrm = () => {
  const crm = useContext(CrmContext)
  if (crm === null) throw new Error("useCrm needs a CrmProvider")
  return crm
}
