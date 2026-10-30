// Table definitions for the D1 database, run with CREATE ... IF NOT EXISTS on first use.
// No imports, so the scheduled (cron) handler can use them outside Next.js too.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    avatar TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  // Forgotten-password links. Like sessions, only a hash of each emailed token is stored.
  `CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets (user_id)`,
  // Failed sign-ins per email, so the per-account limit holds across every server instance.
  `CREATE TABLE IF NOT EXISTS login_failures (
    email TEXT NOT NULL,
    at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS login_failures_email ON login_failures (email, at)`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    user_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, domain)
  )`,
  // Results tracking: every person (or business) found or messaged, per workspace.
  // status: found | contacted | replied | interested | signed_up | not_interested
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    campaign TEXT,
    account TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    linkedin TEXT,
    instagram TEXT,
    channel TEXT,
    status TEXT NOT NULL DEFAULT 'found',
    notes TEXT,
    context TEXT,
    contacted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user_id, workspace_id, account, name)
  )`,
  `CREATE INDEX IF NOT EXISTS leads_workspace ON leads (user_id, workspace_id)`,
  // Every message sent to a lead (first touch or follow-up).
  `CREATE TABLE IF NOT EXISTS lead_messages (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'message',
    sent_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS lead_messages_lead ON lead_messages (lead_id)`,
  // Follow-up sequences. status: scheduled -> due (set by the hourly cron) -> sent; or cancelled.
  `CREATE TABLE IF NOT EXISTS follow_ups (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    step INTEGER NOT NULL,
    channel TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at INTEGER NOT NULL,
    due_marked_at INTEGER,
    sent_at INTEGER
  )`,
  // One subscription per account (Starter or Pro, monthly or yearly), mirrored from Bachs.
  `CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    customer_id TEXT,
    plan TEXT NOT NULL,
    interval TEXT NOT NULL,
    status TEXT NOT NULL,
    current_period_end INTEGER,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    amount TEXT,
    currency TEXT,
    checked_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  // Checkouts started from Junia, so a returning customer is matched to their subscription.
  `CREATE TABLE IF NOT EXISTS billing_checkouts (
    checkout_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    interval TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS follow_ups_lead ON follow_ups (lead_id)`,
  `CREATE INDEX IF NOT EXISTS follow_ups_due ON follow_ups (status, due_at)`,
];
