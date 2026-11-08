import {
  Activity,
  Agent,
  AgentAction,
  ApprovalRequest,
  type BusinessId,
  BusinessProfile,
  ChatMessage,
  Contact,
  Conversation,
  Deal,
  Department,
  Escalation,
  LastMessage,
  Pipeline,
  ProviderPreferences,
  Service
} from "@scope-bot/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import { requireBusiness } from "./CurrentBusiness.ts"
import { type ChannelChat, Store } from "./Store.ts"

type Row = Record<string, unknown>

const MAX_SEARCH_MESSAGES = 50

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value)

const money = (value: unknown) => (value === null ? null : Number(value))

const json = (value: unknown) => JSON.stringify(value)

/** `%` and `_` in what someone typed are text, not wildcards. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`

const toDepartment = (row: Row) => ({ id: row.id, name: row.name, createdAt: iso(row.createdAt) })

const toAgent = ({ businessId: _business, seq: _seq, ...row }: Row) => ({ ...row, createdAt: iso(row.createdAt) })

const toContact = (row: Row) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  channels: { phone: row.phone, whatsapp: row.whatsapp, telegram: row.telegram },
  consent: { messages: row.consentMessages, marketing: row.consentMarketing },
  companyId: row.companyId,
  role: row.role,
  ownerId: row.ownerId,
  tags: row.tags,
  language: row.language,
  bestTime: row.bestTime,
  source: row.source,
  summary: row.summary,
  createdAt: iso(row.createdAt)
})

const toPipeline = (row: Row) => ({ id: row.id, name: row.name, stages: row.stages, createdAt: iso(row.createdAt) })

const toService = ({ businessId: _business, seq: _seq, ...row }: Row) => ({
  ...row,
  price: money(row.price),
  createdAt: iso(row.createdAt)
})

const toDeal = ({ businessId: _business, seq: _seq, ...row }: Row) => ({
  ...row,
  amount: money(row.amount),
  createdAt: iso(row.createdAt),
  stageChangedAt: iso(row.stageChangedAt),
  closedAt: iso(row.closedAt)
})

const toActivity = ({ businessId: _business, seq: _seq, ...row }: Row) => ({ ...row, createdAt: iso(row.createdAt) })

const toApproval = ({ businessId: _business, seq: _seq, ...row }: Row) => ({
  ...row,
  createdAt: iso(row.createdAt),
  decidedAt: iso(row.decidedAt)
})

/** Optional fields are left out instead of null, as the domain schemas expect. */
const present = (row: Row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null))

const toConversation = ({ businessId: _business, seq: _seq, channel, address, contactId, ...row }: Row) => ({
  ...row,
  ...present({ channel, address, contactId }),
  createdAt: iso(row.createdAt)
})

const toMessage = ({ businessId: _business, seq: _seq, images, delivery, externalId, handoff, ...row }: Row) => ({
  ...row,
  ...(images === null || images === undefined ? {} : { images }),
  ...present({ delivery: delivery ?? null, externalId: externalId ?? null, handoff: handoff ?? null }),
  createdAt: iso(row.createdAt)
})

const toAction = ({ businessId: _business, seq: _seq, ...row }: Row) => ({ ...row, createdAt: iso(row.createdAt) })

const toEscalation = ({ businessId: _business, seq: _seq, ...row }: Row) => ({
  ...row,
  createdAt: iso(row.createdAt),
  resolvedAt: iso(row.resolvedAt)
})

/** Rows are checked against the domain schema, so a bad row fails here and not deep in a service. */
const reader = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  toDomain: (row: Row) => unknown
) => {
  const decodeAll = Schema.decodeUnknownEffect(Schema.Array(schema))
  return (rows: ReadonlyArray<Row>) => decodeAll(rows.map(toDomain)).pipe(Effect.orDie)
}

const readDepartments = reader(Department, toDepartment)
const readAgents = reader(Agent, toAgent)
const readContacts = reader(Contact, toContact)
const readPipelines = reader(Pipeline, toPipeline)
const readServices = reader(Service, toService)
const readDeals = reader(Deal, toDeal)
const readActivities = reader(Activity, toActivity)
const readApprovals = reader(ApprovalRequest, toApproval)
const readConversations = reader(Conversation, toConversation)
const readMessages = reader(ChatMessage, toMessage)
const readActions = reader(AgentAction, toAction)
const readEscalations = reader(Escalation, toEscalation)
const readLastMessages = reader(LastMessage, (row) => ({ ...row, createdAt: iso(row.createdAt) }))

const decodeChannelChat = Schema.decodeUnknownEffect(
  Schema.Struct({
    conversation: Conversation,
    lastMessage: Schema.NullOr(ChatMessage),
    drafts: Schema.Int,
    handoff: Schema.NullOr(Schema.String),
    lastCustomerAt: Schema.NullOr(Schema.String)
  })
)

/** A row turned into JSON inside a query keeps its column names and its own date format. */
const fromJsonRow = (value: Record<string, unknown>): Row => {
  const row = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      item
    ])
  )
  return { ...row, createdAt: new Date(String(row.createdAt)).toISOString() }
}

const readChannelChats = (rows: ReadonlyArray<Row>) =>
  Effect.forEach(rows, ({ lastMessage, drafts, handoff, lastCustomerAt, ...row }) =>
    decodeChannelChat({
      conversation: toConversation(row),
      lastMessage:
        lastMessage === null || lastMessage === undefined
          ? null
          : toMessage(fromJsonRow(lastMessage as Record<string, unknown>)),
      drafts,
      handoff: handoff ?? null,
      lastCustomerAt: lastCustomerAt instanceof Date ? lastCustomerAt.toISOString() : null
    })
  ).pipe(
    Effect.map(
      (chats): ReadonlyArray<ChannelChat> =>
        [...chats].sort((a, b) =>
          (b.lastMessage?.createdAt ?? b.conversation.createdAt).localeCompare(
            a.lastMessage?.createdAt ?? a.conversation.createdAt
          )
        )
    ),
    Effect.orDie
  )

const decodeBusiness = Schema.decodeUnknownEffect(BusinessProfile)
const decodePreferences = Schema.decodeUnknownEffect(ProviderPreferences)

const first = <A>(items: ReadonlyArray<A>) => Option.fromNullishOr(items[0])

const agentRow = (business: BusinessId, agent: Agent) => ({
  businessId: business,
  id: agent.id,
  name: agent.name,
  job: agent.job,
  sign: agent.sign,
  role: agent.role,
  departmentId: agent.departmentId,
  color: agent.color,
  tone: agent.tone,
  instructions: agent.instructions,
  provider: agent.provider,
  model: agent.model,
  reasoning: agent.reasoning,
  backupModels: json(agent.backupModels),
  active: agent.active,
  permissions: json(agent.permissions),
  limits: json(agent.limits),
  hours: json(agent.hours),
  escalation: json(agent.escalation),
  pinned: agent.pinned,
  createdAt: agent.createdAt
})

const contactRow = (business: BusinessId, contact: Contact) => ({
  businessId: business,
  id: contact.id,
  kind: contact.kind,
  name: contact.name,
  phone: contact.channels.phone,
  whatsapp: contact.channels.whatsapp,
  telegram: contact.channels.telegram,
  consentMessages: contact.consent.messages,
  consentMarketing: contact.consent.marketing,
  companyId: contact.companyId,
  role: contact.role,
  ownerId: contact.ownerId,
  tags: json(contact.tags),
  language: contact.language,
  bestTime: contact.bestTime,
  source: contact.source,
  summary: contact.summary === null ? null : json(contact.summary),
  createdAt: contact.createdAt
})

const serviceRow = (business: BusinessId, { sellerIds: _sellers, ...service }: Service) => ({
  ...service,
  businessId: business,
  packages: json(service.packages)
})

const dealRow = (business: BusinessId, { serviceIds: _services, ...deal }: Deal) => ({ ...deal, businessId: business })

const messageRow = (business: BusinessId, { images, delivery, externalId, handoff, ...message }: ChatMessage) => ({
  ...message,
  businessId: business,
  images: images === undefined ? null : json(images),
  delivery: delivery ?? null,
  externalId: externalId ?? null,
  handoff: handoff ?? null
})

const conversationRow = (business: BusinessId, { channel, address, contactId, ...conversation }: Conversation) => ({
  ...conversation,
  businessId: business,
  channel: channel ?? null,
  address: address ?? null,
  contactId: contactId ?? null
})

const makeStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  /** Everything below runs inside the current business, and storage failures are bugs, not user errors. */
  const scoped = <A>(query: (business: BusinessId) => Effect.Effect<A, SqlError.SqlError>) =>
    requireBusiness.pipe(Effect.flatMap(query), Effect.orDie)

  const write = <A>(query: (business: BusinessId) => Effect.Effect<A, SqlError.SqlError>) =>
    scoped(query).pipe(Effect.asVoid)

  const atomically = <A>(query: (business: BusinessId) => Effect.Effect<A, SqlError.SqlError>) =>
    scoped((business) => sql.withTransaction(query(business))).pipe(Effect.asVoid)

  const upsert = (table: string, row: Record<string, never> | object) => {
    const values = row as Record<string, string | number | boolean | null>
    return sql`INSERT INTO ${sql(table)} ${sql.insert(values)}
      ON CONFLICT (business_id, id) DO UPDATE SET ${sql.update(values, ["businessId", "id"])}`
  }

  const selectPipelines = (business: BusinessId) =>
    sql<Row>`SELECT p.*, COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'probability', s.probability)
          ORDER BY s.position)
        FROM stages s WHERE s.business_id = p.business_id AND s.pipeline_id = p.id
      ), '[]') AS stages
      FROM pipelines p WHERE p.business_id = ${business} ORDER BY p.seq`

  const selectServices = (business: BusinessId, id: string | null) =>
    sql<Row>`SELECT s.*, COALESCE((
        SELECT jsonb_agg(x.agent_id ORDER BY x.position)
        FROM service_sellers x WHERE x.business_id = s.business_id AND x.service_id = s.id
      ), '[]') AS seller_ids
      FROM services s WHERE s.business_id = ${business} AND (${id}::text IS NULL OR s.id = ${id}) ORDER BY s.seq`

  const selectDeals = (business: BusinessId, id: string | null) =>
    sql<Row>`SELECT d.*, COALESCE((
        SELECT jsonb_agg(x.service_id ORDER BY x.position)
        FROM deal_services x WHERE x.business_id = d.business_id AND x.deal_id = d.id
      ), '[]') AS service_ids
      FROM deals d WHERE d.business_id = ${business} AND (${id}::text IS NULL OR d.id = ${id}) ORDER BY d.seq`

  return Store.of({
    business: scoped(
      (business) => sql<Row>`SELECT name, address, phone, opening_hours, about, currency
        FROM businesses WHERE id = ${business}`
    ).pipe(
      Effect.flatMap((rows) => decodeBusiness(rows[0])),
      Effect.orDie
    ),
    saveBusiness: (profile) =>
      write((business) => sql`UPDATE businesses SET ${sql.update(profile)} WHERE id = ${business}`),
    agents: scoped((business) => sql<Row>`SELECT * FROM agents WHERE business_id = ${business} ORDER BY seq`).pipe(
      Effect.flatMap(readAgents)
    ),
    findAgent: (id) =>
      scoped((business) => sql<Row>`SELECT * FROM agents WHERE business_id = ${business} AND id = ${id}`).pipe(
        Effect.flatMap(readAgents),
        Effect.map(first)
      ),
    saveAgent: (agent) => write((business) => upsert("agents", agentRow(business, agent))),
    removeAgent: (id) => write((business) => sql`DELETE FROM agents WHERE business_id = ${business} AND id = ${id}`),
    contacts: scoped((business) => sql<Row>`SELECT * FROM contacts WHERE business_id = ${business} ORDER BY seq`).pipe(
      Effect.flatMap(readContacts)
    ),
    findContact: (id) =>
      scoped((business) => sql<Row>`SELECT * FROM contacts WHERE business_id = ${business} AND id = ${id}`).pipe(
        Effect.flatMap(readContacts),
        Effect.map(first)
      ),
    saveContact: (contact) => write((business) => upsert("contacts", contactRow(business, contact))),
    removeContact: (id) =>
      atomically((business) =>
        // What belongs to a deal stays with the deal, and the foreign key unlinks it.
        sql`DELETE FROM activities WHERE business_id = ${business} AND contact_id = ${id} AND deal_id IS NULL`.pipe(
          Effect.andThen(sql`DELETE FROM contacts WHERE business_id = ${business} AND id = ${id}`)
        )
      ),
    departments: scoped(
      (business) => sql<Row>`SELECT * FROM departments WHERE business_id = ${business} ORDER BY seq`
    ).pipe(Effect.flatMap(readDepartments)),
    findDepartment: (id) =>
      scoped((business) => sql<Row>`SELECT * FROM departments WHERE business_id = ${business} AND id = ${id}`).pipe(
        Effect.flatMap(readDepartments),
        Effect.map(first)
      ),
    saveDepartment: (department) => write((business) => upsert("departments", { ...department, businessId: business })),
    removeDepartment: (id) =>
      write((business) => sql`DELETE FROM departments WHERE business_id = ${business} AND id = ${id}`),
    pipelines: scoped(selectPipelines).pipe(Effect.flatMap(readPipelines)),
    savePipeline: ({ stages, ...pipeline }) =>
      atomically((business) =>
        Effect.gen(function* () {
          yield* upsert("pipelines", { ...pipeline, businessId: business })
          yield* Effect.forEach(stages, (stage, position) =>
            upsert("stages", { ...stage, businessId: business, pipelineId: pipeline.id, position })
          )
          yield* sql`DELETE FROM stages WHERE business_id = ${business} AND pipeline_id = ${pipeline.id}
            AND id <> ALL(SELECT jsonb_array_elements_text(${json(stages.map((stage) => stage.id))}::jsonb))`
        })
      ),
    services: scoped((business) => selectServices(business, null)).pipe(Effect.flatMap(readServices)),
    findService: (id) =>
      scoped((business) => selectServices(business, id)).pipe(Effect.flatMap(readServices), Effect.map(first)),
    saveService: (service) =>
      atomically((business) =>
        Effect.gen(function* () {
          yield* upsert("services", serviceRow(business, service))
          yield* sql`DELETE FROM service_sellers WHERE business_id = ${business} AND service_id = ${service.id}`
          yield* Effect.forEach(
            service.sellerIds,
            (agentId, position) =>
              sql`INSERT INTO service_sellers ${sql.insert({
                businessId: business,
                serviceId: service.id,
                agentId,
                position
              })}`
          )
        })
      ),
    removeService: (id) =>
      write((business) => sql`DELETE FROM services WHERE business_id = ${business} AND id = ${id}`),
    activities: scoped(
      (business) => sql<Row>`SELECT * FROM activities WHERE business_id = ${business} ORDER BY seq`
    ).pipe(Effect.flatMap(readActivities)),
    findActivity: (id) =>
      scoped((business) => sql<Row>`SELECT * FROM activities WHERE business_id = ${business} AND id = ${id}`).pipe(
        Effect.flatMap(readActivities),
        Effect.map(first)
      ),
    saveActivity: (activity) => write((business) => upsert("activities", { ...activity, businessId: business })),
    removeActivity: (id) =>
      write((business) => sql`DELETE FROM activities WHERE business_id = ${business} AND id = ${id}`),
    approvals: scoped(
      (business) => sql<Row>`SELECT * FROM approvals WHERE business_id = ${business} ORDER BY seq`
    ).pipe(Effect.flatMap(readApprovals)),
    findApproval: (id) =>
      scoped((business) => sql<Row>`SELECT * FROM approvals WHERE business_id = ${business} AND id = ${id}`).pipe(
        Effect.flatMap(readApprovals),
        Effect.map(first)
      ),
    saveApproval: (approval) => write((business) => upsert("approvals", { ...approval, businessId: business })),
    deals: scoped((business) => selectDeals(business, null)).pipe(Effect.flatMap(readDeals)),
    findDeal: (id) =>
      scoped((business) => selectDeals(business, id)).pipe(Effect.flatMap(readDeals), Effect.map(first)),
    saveDeal: (deal) =>
      atomically((business) =>
        Effect.gen(function* () {
          yield* upsert("deals", dealRow(business, deal))
          yield* sql`DELETE FROM deal_services WHERE business_id = ${business} AND deal_id = ${deal.id}`
          yield* Effect.forEach(
            deal.serviceIds,
            (serviceId, position) =>
              sql`INSERT INTO deal_services ${sql.insert({
                businessId: business,
                dealId: deal.id,
                serviceId,
                position
              })}`
          )
        })
      ),
    removeDeal: (id) => write((business) => sql`DELETE FROM deals WHERE business_id = ${business} AND id = ${id}`),
    conversations: (agentId) =>
      scoped(
        (business) => sql<Row>`SELECT * FROM conversations
          WHERE business_id = ${business} AND agent_id = ${agentId} ORDER BY seq`
      ).pipe(Effect.flatMap(readConversations)),
    findConversation: (id) =>
      scoped((business) => sql<Row>`SELECT * FROM conversations WHERE business_id = ${business} AND id = ${id}`).pipe(
        Effect.flatMap(readConversations),
        Effect.map(first)
      ),
    saveConversation: (conversation) =>
      write((business) => upsert("conversations", conversationRow(business, conversation))),
    channelChats: (channel) =>
      scoped(
        (business) => sql<Row>`SELECT c.*,
            (SELECT to_jsonb(m) FROM messages m
              WHERE m.business_id = c.business_id AND m.conversation_id = c.id AND m.role <> 'note'
              ORDER BY m.seq DESC LIMIT 1) AS last_message,
            (SELECT count(*) FROM messages m
              WHERE m.business_id = c.business_id AND m.conversation_id = c.id AND m.delivery = 'draft')::int AS drafts,
            (SELECT e.reason FROM escalations e
              WHERE e.business_id = c.business_id AND e.conversation_id = c.id AND e.resolved_at IS NULL
              ORDER BY e.seq DESC LIMIT 1) AS handoff,
            (SELECT max(m.created_at) FROM messages m
              WHERE m.business_id = c.business_id AND m.conversation_id = c.id AND m.role = 'customer') AS last_customer_at
          FROM conversations c WHERE c.business_id = ${business} AND c.channel = ${channel}`
      ).pipe(Effect.flatMap(readChannelChats)),
    findChannelConversation: (channel, address) =>
      scoped(
        (business) => sql<Row>`SELECT * FROM conversations
          WHERE business_id = ${business} AND channel = ${channel} AND address = ${address}`
      ).pipe(Effect.flatMap(readConversations), Effect.map(first)),
    conversationMessages: (id) =>
      scoped(
        (business) =>
          sql<Row>`SELECT * FROM messages WHERE business_id = ${business} AND conversation_id = ${id} ORDER BY seq`
      ).pipe(Effect.flatMap(readMessages)),
    findMessage: (id) =>
      scoped((business) => sql<Row>`SELECT * FROM messages WHERE business_id = ${business} AND id = ${id}`).pipe(
        Effect.flatMap(readMessages),
        Effect.map(first)
      ),
    findExternalMessage: (externalId) =>
      scoped(
        (business) => sql<Row>`SELECT * FROM messages WHERE business_id = ${business} AND external_id = ${externalId}`
      ).pipe(Effect.flatMap(readMessages), Effect.map(first)),
    saveMessage: (message) =>
      write((business) => {
        const { businessId: _business, id, ...values } = messageRow(business, message)
        return sql`UPDATE messages SET ${sql.update(values)} WHERE business_id = ${business} AND id = ${id}`
      }),
    removeConversation: (id) =>
      write((business) => sql`DELETE FROM conversations WHERE business_id = ${business} AND id = ${id}`),
    messages: (agentId) =>
      scoped(
        (business) =>
          sql<Row>`SELECT * FROM messages WHERE business_id = ${business} AND agent_id = ${agentId} ORDER BY seq`
      ).pipe(Effect.flatMap(readMessages)),
    appendMessage: (message) =>
      write((business) => {
        const values = messageRow(business, message)
        return sql`INSERT INTO messages ${sql.insert(values)}`
      }),
    lastMessages: scoped(
      (business) => sql<Row>`SELECT DISTINCT ON (agent_id) agent_id, text, created_at
        FROM messages WHERE business_id = ${business} AND role <> 'note'
          AND (delivery IS NULL OR delivery IN ('sending', 'sent')) ORDER BY agent_id, seq DESC`
    ).pipe(Effect.flatMap(readLastMessages)),
    searchMessages: (query) =>
      scoped(
        // Chats with customers on a channel are not tabs of the employee, so search leaves them out.
        (business) => sql<Row>`WITH said AS (
            SELECT m.* FROM messages m JOIN conversations c ON c.business_id = m.business_id AND c.id = m.conversation_id
            WHERE m.business_id = ${business} AND m.role <> 'note' AND c.channel IS NULL
          )
          SELECT id, agent_id, conversation_id, role, text, created_at FROM (
            (SELECT DISTINCT ON (agent_id) * FROM said WHERE text <> '' ORDER BY agent_id, seq DESC)
            UNION
            (SELECT * FROM said WHERE ${query} <> '' AND text ILIKE ${likePattern(query)}
              ORDER BY seq DESC LIMIT ${MAX_SEARCH_MESSAGES})
          ) found ORDER BY seq`
      ).pipe(Effect.flatMap(readMessages)),
    actions: (agentId) =>
      scoped(
        (business) => sql<Row>`SELECT * FROM agent_actions
          WHERE business_id = ${business} AND agent_id = ${agentId} ORDER BY seq`
      ).pipe(Effect.flatMap(readActions)),
    appendAction: (action) =>
      write((business) => {
        const values = { ...action, businessId: business }
        return sql`INSERT INTO agent_actions ${sql.insert(values)}`
      }),
    openEscalation: (conversationId) =>
      scoped(
        (business) => sql<Row>`SELECT * FROM escalations
          WHERE business_id = ${business} AND conversation_id = ${conversationId} AND resolved_at IS NULL LIMIT 1`
      ).pipe(Effect.flatMap(readEscalations), Effect.map(first)),
    openEscalations: scoped(
      (business) => sql<Row>`SELECT * FROM escalations
        WHERE business_id = ${business} AND resolved_at IS NULL ORDER BY seq`
    ).pipe(Effect.flatMap(readEscalations)),
    appendEscalation: (escalation) =>
      write((business) => {
        const values = { ...escalation, businessId: business }
        return sql`INSERT INTO escalations ${sql.insert(values)}`
      }),
    resolveEscalation: (conversationId, resolvedAt) =>
      write(
        (business) => sql`UPDATE escalations SET resolved_at = ${resolvedAt}
          WHERE business_id = ${business} AND conversation_id = ${conversationId} AND resolved_at IS NULL`
      ),
    preferences: scoped((business) => sql<Row>`SELECT preferences FROM businesses WHERE id = ${business}`).pipe(
      Effect.flatMap((rows) => decodePreferences(rows[0]?.preferences)),
      Effect.orDie
    ),
    savePreferences: (preferences) =>
      write((business) => sql`UPDATE businesses SET preferences = ${json(preferences)}::jsonb WHERE id = ${business}`)
  })
})

/** The real storage. Every query is scoped by the current business. */
export const pgStoreLayer = Layer.effect(Store, makeStore)
