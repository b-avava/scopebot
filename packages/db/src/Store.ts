import {
  Activity,
  type ActivityId,
  Agent,
  AgentAction,
  type AgentId,
  type ApprovalId,
  ApprovalRequest,
  BusinessProfile,
  type Channel,
  ChatMessage,
  Contact,
  type ContactId,
  Conversation,
  type ConversationId,
  Deal,
  type DealId,
  Department,
  type DepartmentId,
  Escalation,
  emptyBusinessProfile,
  emptyProviderPreferences,
  type LastMessage,
  type MessageId,
  Pipeline,
  ProviderPreferences,
  Service,
  type ServiceId
} from "@scope-bot/domain"
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect"

/** Everything a business has. It is the shape of the memory store and of the old data file. */
export const Data = Schema.Struct({
  business: BusinessProfile,
  agents: Schema.Array(Agent),
  contacts: Schema.Array(Contact),
  departments: Schema.Array(Department),
  pipelines: Schema.Array(Pipeline),
  deals: Schema.Array(Deal),
  services: Schema.Array(Service),
  activities: Schema.Array(Activity),
  approvals: Schema.Array(ApprovalRequest),
  conversations: Schema.Array(Conversation),
  messages: Schema.Array(ChatMessage),
  actions: Schema.Array(AgentAction),
  escalations: Schema.Array(Escalation),
  preferences: ProviderPreferences
})
export type Data = typeof Data.Type

/** A chat on a channel, with what its list row needs. */
export interface ChannelChat {
  readonly conversation: Conversation
  readonly lastMessage: ChatMessage | null
  /** Replies that wait for a person. */
  readonly drafts: number
  /** Why a person has the chat now, or null while the employee answers. */
  readonly handoff: string | null
  /** When the customer last wrote, which some channels count the time to answer from. */
  readonly lastCustomerAt: string | null
}

export const emptyData: Data = {
  business: emptyBusinessProfile,
  agents: [],
  contacts: [],
  departments: [],
  pipelines: [],
  deals: [],
  services: [],
  activities: [],
  approvals: [],
  conversations: [],
  messages: [],
  actions: [],
  escalations: [],
  preferences: emptyProviderPreferences
}

/**
 * Storage used by the domain services. PostgreSQL is the real one (see
 * `PgStore`), and tests use memory. Only this service knows how data is
 * stored, and it always works in `CurrentBusiness`.
 */
export class Store extends Context.Service<
  Store,
  {
    readonly business: Effect.Effect<BusinessProfile>
    saveBusiness(business: BusinessProfile): Effect.Effect<void>
    readonly agents: Effect.Effect<ReadonlyArray<Agent>>
    findAgent(id: AgentId): Effect.Effect<Option.Option<Agent>>
    saveAgent(agent: Agent): Effect.Effect<void>
    /** Also removes the agent's chats, messages, actions and escalations. */
    removeAgent(id: AgentId): Effect.Effect<void>
    readonly contacts: Effect.Effect<ReadonlyArray<Contact>>
    findContact(id: ContactId): Effect.Effect<Option.Option<Contact>>
    saveContact(contact: Contact): Effect.Effect<void>
    /** Also unlinks it from its deals and people, and removes its notes and tasks. */
    removeContact(id: ContactId): Effect.Effect<void>
    readonly departments: Effect.Effect<ReadonlyArray<Department>>
    findDepartment(id: DepartmentId): Effect.Effect<Option.Option<Department>>
    saveDepartment(department: Department): Effect.Effect<void>
    /** Its agents stay and no longer belong to a department. */
    removeDepartment(id: DepartmentId): Effect.Effect<void>
    readonly pipelines: Effect.Effect<ReadonlyArray<Pipeline>>
    savePipeline(pipeline: Pipeline): Effect.Effect<void>
    readonly services: Effect.Effect<ReadonlyArray<Service>>
    findService(id: ServiceId): Effect.Effect<Option.Option<Service>>
    saveService(service: Service): Effect.Effect<void>
    /** Also takes it off its deals. */
    removeService(id: ServiceId): Effect.Effect<void>
    readonly activities: Effect.Effect<ReadonlyArray<Activity>>
    findActivity(id: ActivityId): Effect.Effect<Option.Option<Activity>>
    saveActivity(activity: Activity): Effect.Effect<void>
    removeActivity(id: ActivityId): Effect.Effect<void>
    readonly approvals: Effect.Effect<ReadonlyArray<ApprovalRequest>>
    findApproval(id: ApprovalId): Effect.Effect<Option.Option<ApprovalRequest>>
    saveApproval(approval: ApprovalRequest): Effect.Effect<void>
    readonly deals: Effect.Effect<ReadonlyArray<Deal>>
    findDeal(id: DealId): Effect.Effect<Option.Option<Deal>>
    saveDeal(deal: Deal): Effect.Effect<void>
    /** Also removes its notes, tasks and approvals. */
    removeDeal(id: DealId): Effect.Effect<void>
    conversations(agentId: AgentId): Effect.Effect<ReadonlyArray<Conversation>>
    findConversation(id: ConversationId): Effect.Effect<Option.Option<Conversation>>
    saveConversation(conversation: Conversation): Effect.Effect<void>
    /** Also removes its messages and escalations. The audit log stays. */
    removeConversation(id: ConversationId): Effect.Effect<void>
    /** Every employee's chats on a channel, newest message first. */
    channelChats(channel: Channel): Effect.Effect<ReadonlyArray<ChannelChat>>
    findChannelConversation(channel: Channel, address: string): Effect.Effect<Option.Option<Conversation>>
    messages(agentId: AgentId): Effect.Effect<ReadonlyArray<ChatMessage>>
    conversationMessages(id: ConversationId): Effect.Effect<ReadonlyArray<ChatMessage>>
    findMessage(id: MessageId): Effect.Effect<Option.Option<ChatMessage>>
    /** A message the channel already delivered, found by the id it gave it. */
    findExternalMessage(externalId: string): Effect.Effect<Option.Option<ChatMessage>>
    appendMessage(message: ChatMessage): Effect.Effect<void>
    /** Changes a stored message, for example when a draft is sent. */
    saveMessage(message: ChatMessage): Effect.Effect<void>
    /** The newest message of each employee that a customer could see. */
    readonly lastMessages: Effect.Effect<ReadonlyArray<LastMessage>>
    /** What search needs: the newest message of each employee, and the ones that contain the text. */
    searchMessages(query: string): Effect.Effect<ReadonlyArray<ChatMessage>>
    actions(agentId: AgentId): Effect.Effect<ReadonlyArray<AgentAction>>
    appendAction(action: AgentAction): Effect.Effect<void>
    openEscalation(conversationId: ConversationId): Effect.Effect<Option.Option<Escalation>>
    /** Every chat a person has taken over and not handed back. */
    readonly openEscalations: Effect.Effect<ReadonlyArray<Escalation>>
    appendEscalation(escalation: Escalation): Effect.Effect<void>
    resolveEscalation(conversationId: ConversationId, resolvedAt: string): Effect.Effect<void>
    readonly preferences: Effect.Effect<ProviderPreferences>
    savePreferences(preferences: ProviderPreferences): Effect.Effect<void>
  }
>()("@scope-bot/db/Store") {
  static readonly layerMemory = Layer.effect(
    Store,
    Effect.suspend(() => make(emptyData))
  )
}

const MAX_FOUND = 50

/** A draft, a discarded one or a failed one never reached the customer. */
const reachedCustomer = (message: ChatMessage) =>
  message.delivery === undefined || message.delivery === "sending" || message.delivery === "sent"

const upsert = <A extends { readonly id: string }>(items: ReadonlyArray<A>, item: A): ReadonlyArray<A> =>
  items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item]

const make = (initial: Data) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1)
    let data = initial

    const update = (change: (current: Data) => Data) =>
      Semaphore.withPermit(
        lock,
        Effect.sync(() => {
          data = change(data)
        })
      )

    return Store.of({
      business: Effect.sync(() => data.business),
      saveBusiness: (business) => update((current) => ({ ...current, business })),
      agents: Effect.sync(() => data.agents),
      findAgent: (id) => Effect.sync(() => Option.fromNullishOr(data.agents.find((agent) => agent.id === id))),
      saveAgent: (agent) =>
        update((current) => ({
          ...current,
          agents: current.agents.some((existing) => existing.id === agent.id)
            ? current.agents.map((existing) => (existing.id === agent.id ? agent : existing))
            : [...current.agents, agent]
        })),
      removeAgent: (id) =>
        update((current) => ({
          ...current,
          agents: current.agents.filter((agent) => agent.id !== id),
          contacts: current.contacts.map((contact) =>
            contact.ownerId === id ? { ...contact, ownerId: null } : contact
          ),
          activities: current.activities.map((item) => (item.agentId === id ? { ...item, agentId: null } : item)),
          approvals: current.approvals.filter((approval) => approval.agentId !== id),
          deals: current.deals.map((deal) => (deal.ownerId === id ? { ...deal, ownerId: null } : deal)),
          services: current.services.map((service) => ({
            ...service,
            sellerIds: service.sellerIds.filter((sellerId) => sellerId !== id)
          })),
          conversations: current.conversations.filter((conversation) => conversation.agentId !== id),
          messages: current.messages.filter((message) => message.agentId !== id),
          actions: current.actions.filter((action) => action.agentId !== id),
          escalations: current.escalations.filter((escalation) => escalation.agentId !== id)
        })),
      contacts: Effect.sync(() => data.contacts),
      findContact: (id) => Effect.sync(() => Option.fromNullishOr(data.contacts.find((contact) => contact.id === id))),
      saveContact: (contact) =>
        update((current) => ({
          ...current,
          contacts: current.contacts.some((existing) => existing.id === contact.id)
            ? current.contacts.map((existing) => (existing.id === contact.id ? contact : existing))
            : [...current.contacts, contact]
        })),
      removeContact: (id) =>
        update((current) => ({
          ...current,
          contacts: current.contacts
            .filter((contact) => contact.id !== id)
            .map((contact) => (contact.companyId === id ? { ...contact, companyId: null } : contact)),
          deals: current.deals.map((deal) => (deal.contactId === id ? { ...deal, contactId: null } : deal)),
          // What belongs to a deal stays with the deal, as the deal itself does.
          activities: current.activities
            .filter((activity) => activity.contactId !== id || activity.dealId !== null)
            .map((activity) => (activity.contactId === id ? { ...activity, contactId: null } : activity)),
          approvals: current.approvals.map((item) => (item.contactId === id ? { ...item, contactId: null } : item))
        })),
      departments: Effect.sync(() => data.departments),
      findDepartment: (id) =>
        Effect.sync(() => Option.fromNullishOr(data.departments.find((department) => department.id === id))),
      saveDepartment: (department) =>
        update((current) => ({
          ...current,
          departments: current.departments.some((existing) => existing.id === department.id)
            ? current.departments.map((existing) => (existing.id === department.id ? department : existing))
            : [...current.departments, department]
        })),
      removeDepartment: (id) =>
        update((current) => ({
          ...current,
          departments: current.departments.filter((department) => department.id !== id),
          agents: current.agents.map((agent) => (agent.departmentId === id ? { ...agent, departmentId: null } : agent))
        })),
      pipelines: Effect.sync(() => data.pipelines),
      savePipeline: (pipeline) =>
        update((current) => ({
          ...current,
          pipelines: current.pipelines.some((existing) => existing.id === pipeline.id)
            ? current.pipelines.map((existing) => (existing.id === pipeline.id ? pipeline : existing))
            : [...current.pipelines, pipeline]
        })),
      deals: Effect.sync(() => data.deals),
      findDeal: (id) => Effect.sync(() => Option.fromNullishOr(data.deals.find((deal) => deal.id === id))),
      saveDeal: (deal) =>
        update((current) => ({
          ...current,
          deals: current.deals.some((existing) => existing.id === deal.id)
            ? current.deals.map((existing) => (existing.id === deal.id ? deal : existing))
            : [...current.deals, deal]
        })),
      removeDeal: (id) =>
        update((current) => ({
          ...current,
          deals: current.deals.filter((deal) => deal.id !== id),
          activities: current.activities.filter((activity) => activity.dealId !== id),
          approvals: current.approvals.filter((approval) => approval.dealId !== id)
        })),
      services: Effect.sync(() => data.services),
      findService: (id) => Effect.sync(() => Option.fromNullishOr(data.services.find((service) => service.id === id))),
      saveService: (service) => update((current) => ({ ...current, services: upsert(current.services, service) })),
      removeService: (id) =>
        update((current) => ({
          ...current,
          services: current.services.filter((service) => service.id !== id),
          deals: current.deals.map((deal) => ({
            ...deal,
            serviceIds: deal.serviceIds.filter((serviceId) => serviceId !== id)
          }))
        })),
      activities: Effect.sync(() => data.activities),
      findActivity: (id) => Effect.sync(() => Option.fromNullishOr(data.activities.find((item) => item.id === id))),
      saveActivity: (activity) =>
        update((current) => ({ ...current, activities: upsert(current.activities, activity) })),
      removeActivity: (id) =>
        update((current) => ({ ...current, activities: current.activities.filter((item) => item.id !== id) })),
      approvals: Effect.sync(() => data.approvals),
      findApproval: (id) => Effect.sync(() => Option.fromNullishOr(data.approvals.find((item) => item.id === id))),
      saveApproval: (approval) => update((current) => ({ ...current, approvals: upsert(current.approvals, approval) })),
      conversations: (agentId) =>
        Effect.sync(() => data.conversations.filter((conversation) => conversation.agentId === agentId)),
      findConversation: (id) =>
        Effect.sync(() => Option.fromNullishOr(data.conversations.find((conversation) => conversation.id === id))),
      saveConversation: (conversation) =>
        update((current) => ({
          ...current,
          conversations: current.conversations.some((existing) => existing.id === conversation.id)
            ? current.conversations.map((existing) => (existing.id === conversation.id ? conversation : existing))
            : [...current.conversations, conversation]
        })),
      removeConversation: (id) =>
        update((current) => ({
          ...current,
          conversations: current.conversations.filter((conversation) => conversation.id !== id),
          messages: current.messages.filter((message) => message.conversationId !== id),
          escalations: current.escalations.filter((escalation) => escalation.conversationId !== id)
        })),
      channelChats: (channel) =>
        Effect.sync(() =>
          data.conversations
            .filter((conversation) => conversation.channel === channel)
            .map((conversation) => {
              const said = data.messages.filter((message) => message.conversationId === conversation.id)
              return {
                conversation,
                lastMessage: said.findLast((message) => message.role !== "note") ?? null,
                drafts: said.filter((message) => message.delivery === "draft").length,
                lastCustomerAt: said.findLast((message) => message.role === "customer")?.createdAt ?? null,
                handoff:
                  data.escalations.findLast(
                    (escalation) => escalation.conversationId === conversation.id && escalation.resolvedAt === null
                  )?.reason ?? null
              }
            })
            .sort((a, b) =>
              (b.lastMessage?.createdAt ?? b.conversation.createdAt).localeCompare(
                a.lastMessage?.createdAt ?? a.conversation.createdAt
              )
            )
        ),
      findChannelConversation: (channel, address) =>
        Effect.sync(() =>
          Option.fromNullishOr(
            data.conversations.find(
              (conversation) => conversation.channel === channel && conversation.address === address
            )
          )
        ),
      messages: (agentId) => Effect.sync(() => data.messages.filter((message) => message.agentId === agentId)),
      conversationMessages: (id) => Effect.sync(() => data.messages.filter((message) => message.conversationId === id)),
      findMessage: (id) => Effect.sync(() => Option.fromNullishOr(data.messages.find((message) => message.id === id))),
      findExternalMessage: (externalId) =>
        Effect.sync(() => Option.fromNullishOr(data.messages.find((message) => message.externalId === externalId))),
      appendMessage: (message) => update((current) => ({ ...current, messages: [...current.messages, message] })),
      saveMessage: (message) => update((current) => ({ ...current, messages: upsert(current.messages, message) })),
      lastMessages: Effect.sync(() =>
        data.agents.flatMap((agent) => {
          const last = data.messages.findLast(
            (item) => item.agentId === agent.id && item.role !== "note" && reachedCustomer(item)
          )
          return last === undefined ? [] : [{ agentId: agent.id, text: last.text, createdAt: last.createdAt }]
        })
      ),
      searchMessages: (query) =>
        Effect.sync(() => {
          const channelChats = new Set(
            data.conversations.filter((item) => item.channel !== undefined).map((item) => item.id)
          )
          const said = data.messages.filter(
            (message) => message.role !== "note" && !channelChats.has(message.conversationId)
          )
          const newest = data.agents.flatMap(
            (agent) => said.findLast((message) => message.agentId === agent.id && message.text !== "") ?? []
          )
          const text = query.toLowerCase()
          const matching =
            text === "" ? [] : said.filter((message) => message.text.toLowerCase().includes(text)).slice(-MAX_FOUND)
          return said.filter((message) => newest.includes(message) || matching.includes(message))
        }),
      actions: (agentId) => Effect.sync(() => data.actions.filter((action) => action.agentId === agentId)),
      appendAction: (action) => update((current) => ({ ...current, actions: [...current.actions, action] })),
      openEscalation: (conversationId) =>
        Effect.sync(() =>
          Option.fromNullishOr(
            data.escalations.find(
              (escalation) => escalation.conversationId === conversationId && escalation.resolvedAt === null
            )
          )
        ),
      openEscalations: Effect.sync(() => data.escalations.filter((escalation) => escalation.resolvedAt === null)),
      appendEscalation: (escalation) =>
        update((current) => ({ ...current, escalations: [...current.escalations, escalation] })),
      preferences: Effect.sync(() => data.preferences),
      savePreferences: (preferences) => update((current) => ({ ...current, preferences })),
      resolveEscalation: (conversationId, resolvedAt) =>
        update((current) => ({
          ...current,
          escalations: current.escalations.map((escalation) =>
            escalation.conversationId === conversationId && escalation.resolvedAt === null
              ? { ...escalation, resolvedAt }
              : escalation
          )
        }))
    })
  })
