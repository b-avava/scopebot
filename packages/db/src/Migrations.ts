import { Effect } from "effect"
import { Migrator, SqlClient } from "effect/sql"

const run = (statements: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* Effect.forEach(statements, (statement) => sql.unsafe(statement), { discard: true })
  })

/**
 * Every table starts with `business_id`, and keys are `(business_id, id)`. A
 * foreign key then also proves that both rows belong to the same business, so
 * no bug or crafted id can link or overwrite data of another business.
 * `seq` keeps the order things were added in.
 */
const initial = [
  `CREATE TABLE businesses (
    id text PRIMARY KEY,
    name text NOT NULL DEFAULT '',
    address text NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',
    opening_hours text NOT NULL DEFAULT '',
    about text NOT NULL DEFAULT '',
    currency text NOT NULL DEFAULT 'GEL',
    preferences jsonb NOT NULL DEFAULT '{"defaultProvider":null,"disabled":[],"hiddenModels":[]}',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE users (
    id text PRIMARY KEY,
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    seq bigint GENERATED ALWAYS AS IDENTITY
  )`,
  `CREATE INDEX users_business ON users (business_id)`,
  `CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  )`,
  `CREATE INDEX sessions_user ON sessions (user_id)`,
  `CREATE TABLE invites (
    token_hash text PRIMARY KEY,
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('admin', 'member')),
    created_by text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    used_at timestamptz
  )`,
  `CREATE TABLE login_failures (
    email text NOT NULL,
    failed_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX login_failures_email ON login_failures (email, failed_at)`,
  `CREATE TABLE provider_keys (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    provider text NOT NULL,
    key_encrypted text NOT NULL,
    base_url text NOT NULL DEFAULT '',
    PRIMARY KEY (business_id, provider)
  )`,
  `CREATE TABLE departments (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id)
  )`,
  `CREATE TABLE agents (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    name text NOT NULL,
    job text NOT NULL,
    department_id text,
    color text NOT NULL,
    shape text NOT NULL,
    face text NOT NULL,
    tone text NOT NULL,
    instructions text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    reasoning text NOT NULL,
    backup_models jsonb NOT NULL,
    active boolean NOT NULL,
    permissions jsonb NOT NULL,
    limits jsonb NOT NULL,
    hours jsonb NOT NULL,
    escalation jsonb NOT NULL,
    pinned boolean NOT NULL,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, department_id) REFERENCES departments (business_id, id)
      ON DELETE SET NULL (department_id)
  )`,
  `CREATE TABLE contacts (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('person', 'company')),
    name text NOT NULL,
    phone text NOT NULL,
    whatsapp text NOT NULL,
    telegram text NOT NULL,
    consent_messages boolean NOT NULL,
    consent_marketing boolean NOT NULL,
    company_id text,
    role text NOT NULL,
    owner_id text,
    tags jsonb NOT NULL,
    language text NOT NULL,
    best_time text NOT NULL,
    source text NOT NULL,
    summary jsonb,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, company_id) REFERENCES contacts (business_id, id) ON DELETE SET NULL (company_id),
    FOREIGN KEY (business_id, owner_id) REFERENCES agents (business_id, id) ON DELETE SET NULL (owner_id)
  )`,
  `CREATE TABLE pipelines (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id)
  )`,
  `CREATE TABLE stages (
    business_id text NOT NULL,
    id text NOT NULL,
    pipeline_id text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('open', 'won', 'lost')),
    probability double precision NOT NULL CHECK (probability BETWEEN 0 AND 100),
    position integer NOT NULL,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, pipeline_id) REFERENCES pipelines (business_id, id) ON DELETE CASCADE
  )`,
  `CREATE TABLE services (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    pricing text NOT NULL,
    price numeric(14, 2),
    duration text NOT NULL,
    packages jsonb NOT NULL,
    active boolean NOT NULL,
    quote_policy text NOT NULL,
    proposal_policy text NOT NULL,
    discount_policy text NOT NULL,
    max_discount_percent double precision NOT NULL,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id)
  )`,
  `CREATE TABLE service_sellers (
    business_id text NOT NULL,
    service_id text NOT NULL,
    agent_id text NOT NULL,
    position integer NOT NULL,
    PRIMARY KEY (business_id, service_id, agent_id),
    FOREIGN KEY (business_id, service_id) REFERENCES services (business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE CASCADE
  )`,
  `CREATE TABLE deals (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    title text NOT NULL,
    contact_id text,
    pipeline_id text NOT NULL,
    stage_id text NOT NULL,
    amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
    source text NOT NULL,
    owner_id text,
    next_step text NOT NULL,
    next_step_at date,
    close_date date,
    probability double precision CHECK (probability BETWEEN 0 AND 100),
    lost_reason text NOT NULL,
    created_at timestamptz NOT NULL,
    stage_changed_at timestamptz NOT NULL,
    closed_at timestamptz,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, contact_id) REFERENCES contacts (business_id, id) ON DELETE SET NULL (contact_id),
    FOREIGN KEY (business_id, pipeline_id) REFERENCES pipelines (business_id, id),
    FOREIGN KEY (business_id, stage_id) REFERENCES stages (business_id, id),
    FOREIGN KEY (business_id, owner_id) REFERENCES agents (business_id, id) ON DELETE SET NULL (owner_id)
  )`,
  `CREATE INDEX deals_stage ON deals (business_id, stage_id)`,
  `CREATE INDEX deals_contact ON deals (business_id, contact_id)`,
  `CREATE TABLE deal_services (
    business_id text NOT NULL,
    deal_id text NOT NULL,
    service_id text NOT NULL,
    position integer NOT NULL,
    PRIMARY KEY (business_id, deal_id, service_id),
    FOREIGN KEY (business_id, deal_id) REFERENCES deals (business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, service_id) REFERENCES services (business_id, id) ON DELETE CASCADE
  )`,
  `CREATE TABLE activities (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('note', 'task', 'event')),
    text text NOT NULL,
    contact_id text,
    deal_id text,
    agent_id text,
    done boolean NOT NULL,
    due_at date,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, contact_id) REFERENCES contacts (business_id, id) ON DELETE SET NULL (contact_id),
    FOREIGN KEY (business_id, deal_id) REFERENCES deals (business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE SET NULL (agent_id)
  )`,
  `CREATE INDEX activities_contact ON activities (business_id, contact_id)`,
  `CREATE INDEX activities_deal ON activities (business_id, deal_id)`,
  `CREATE TABLE approvals (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    id text NOT NULL,
    agent_id text NOT NULL,
    deal_id text,
    contact_id text,
    title text NOT NULL,
    reason text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
    created_at timestamptz NOT NULL,
    decided_at timestamptz,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, deal_id) REFERENCES deals (business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, contact_id) REFERENCES contacts (business_id, id) ON DELETE SET NULL (contact_id)
  )`,
  `CREATE TABLE conversations (
    business_id text NOT NULL,
    id text NOT NULL,
    agent_id text NOT NULL,
    title text NOT NULL,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE CASCADE
  )`,
  `CREATE INDEX conversations_agent ON conversations (business_id, agent_id)`,
  `CREATE TABLE messages (
    business_id text NOT NULL,
    id text NOT NULL,
    agent_id text NOT NULL,
    conversation_id text NOT NULL,
    role text NOT NULL CHECK (role IN ('customer', 'agent', 'note')),
    text text NOT NULL,
    images jsonb,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, conversation_id) REFERENCES conversations (business_id, id) ON DELETE CASCADE
  )`,
  `CREATE INDEX messages_agent ON messages (business_id, agent_id, seq)`,
  `CREATE INDEX messages_conversation ON messages (business_id, conversation_id)`,
  `CREATE TABLE agent_actions (
    business_id text NOT NULL,
    id text NOT NULL,
    agent_id text NOT NULL,
    tool text NOT NULL,
    status text NOT NULL CHECK (status IN ('done', 'failed')),
    summary text NOT NULL,
    source_message_id text NOT NULL,
    model text NOT NULL,
    input_tokens double precision NOT NULL,
    output_tokens double precision NOT NULL,
    created_at timestamptz NOT NULL,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE CASCADE
  )`,
  `CREATE INDEX agent_actions_agent ON agent_actions (business_id, agent_id, seq)`,
  `CREATE TABLE escalations (
    business_id text NOT NULL,
    id text NOT NULL,
    agent_id text NOT NULL,
    conversation_id text NOT NULL,
    reason text NOT NULL,
    created_at timestamptz NOT NULL,
    resolved_at timestamptz,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    PRIMARY KEY (business_id, id),
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE CASCADE,
    FOREIGN KEY (business_id, conversation_id) REFERENCES conversations (business_id, id) ON DELETE CASCADE
  )`,
  `CREATE INDEX escalations_open ON escalations (business_id, conversation_id) WHERE resolved_at IS NULL`
]

/** One look for every employee: the face follows the state, so only the colour is stored. */
const avatarColourOnly = ["ALTER TABLE agents DROP COLUMN shape, DROP COLUMN face"]

/** The job title is free text, so the sign is its own field. Known titles keep their old sign. */
const signAndRole = [
  "ALTER TABLE agents ADD COLUMN sign text, ADD COLUMN role text",
  `UPDATE agents SET sign = CASE job
    WHEN 'Front desk' THEN 'headset' WHEN 'Sales' THEN 'tag' WHEN 'Follow-ups' THEN 'repeat' WHEN 'Reports' THEN 'chart'
  END`
]

/**
 * Chats with customers on WhatsApp. A channel chat names its customer and where to
 * answer, and its replies say whether they reached the customer. The linked device
 * keys are encrypted like API keys.
 */
const whatsapp = [
  `ALTER TABLE conversations
    ADD COLUMN channel text CHECK (channel IN ('whatsapp')),
    ADD COLUMN address text,
    ADD COLUMN contact_id text,
    ADD FOREIGN KEY (business_id, contact_id) REFERENCES contacts (business_id, id) ON DELETE SET NULL (contact_id)`,
  `CREATE UNIQUE INDEX conversations_address ON conversations (business_id, channel, address) WHERE channel IS NOT NULL`,
  `ALTER TABLE messages DROP CONSTRAINT messages_role_check`,
  `ALTER TABLE messages
    ADD CONSTRAINT messages_role_check CHECK (role IN ('customer', 'agent', 'note', 'person')),
    ADD COLUMN delivery text CHECK (delivery IN ('draft', 'sending', 'sent', 'failed', 'discarded')),
    ADD COLUMN external_id text`,
  `CREATE UNIQUE INDEX messages_external ON messages (business_id, external_id) WHERE external_id IS NOT NULL`,
  `CREATE INDEX messages_drafts ON messages (business_id, conversation_id) WHERE delivery = 'draft'`,
  `CREATE TABLE whatsapp_links (
    business_id text PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
    agent_id text,
    audience text NOT NULL CHECK (audience IN ('everyone', 'contacts')),
    answers_alone boolean NOT NULL,
    phone text,
    linked_at timestamptz,
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE SET NULL (agent_id)
  )`,
  `CREATE TABLE whatsapp_session (
    business_id text NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    key text NOT NULL,
    value_encrypted text NOT NULL,
    PRIMARY KEY (business_id, key)
  )`
]

/** Telegram as a second channel. The bot token is encrypted like API keys. */
const telegram = [
  "ALTER TABLE conversations DROP CONSTRAINT conversations_channel_check",
  "ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check CHECK (channel IN ('whatsapp', 'telegram'))",
  `CREATE TABLE telegram_links (
    business_id text PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
    agent_id text,
    audience text NOT NULL CHECK (audience IN ('everyone', 'contacts')),
    answers_alone boolean NOT NULL,
    token_encrypted text,
    bot_username text,
    bot_name text,
    connected_at timestamptz,
    update_offset bigint NOT NULL DEFAULT 0,
    business_account jsonb,
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE SET NULL (agent_id)
  )`
]

/** A drafted reply can carry a handoff that happens only when a person sends it. */
const draftHandoff = ["ALTER TABLE messages ADD COLUMN handoff text"]

/** Instagram as a third channel. The access token is encrypted like API keys. */
const instagram = [
  "ALTER TABLE conversations DROP CONSTRAINT conversations_channel_check",
  "ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check CHECK (channel IN ('whatsapp', 'telegram', 'instagram'))",
  `CREATE TABLE instagram_links (
    business_id text PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
    agent_id text,
    audience text NOT NULL CHECK (audience IN ('everyone', 'contacts')),
    answers_alone boolean NOT NULL,
    token_encrypted text,
    token_expires_at timestamptz,
    account_id text UNIQUE,
    username text,
    name text,
    connected_at timestamptz,
    FOREIGN KEY (business_id, agent_id) REFERENCES agents (business_id, id) ON DELETE SET NULL (agent_id)
  )`
]

/** Runs what has not run yet. Add new migrations to the end, and never change one that has shipped. */
export const migrate = Migrator.make({})({
  loader: Migrator.fromRecord({
    "0001_initial": run(initial),
    "0002_avatar_colour_only": run(avatarColourOnly),
    "0003_sign_and_role": run(signAndRole),
    "0004_whatsapp": run(whatsapp),
    "0005_telegram": run(telegram),
    "0006_draft_handoff": run(draftHandoff),
    "0007_instagram": run(instagram)
  })
})
