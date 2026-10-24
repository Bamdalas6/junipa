import { getCloudflareContext } from "@opennextjs/cloudflare";

// The app's database: Cloudflare D1 (binding "DB" in wrangler.jsonc). In `next dev`
// the same binding is a local SQLite file under .wrangler/ (see next.config.ts).
// Tables are created on first use, so a new database needs no migration step.

export interface D1Result<T> {
  results: T[];
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

const SCHEMA = [
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
  `CREATE TABLE IF NOT EXISTS workspaces (
    user_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, domain)
  )`,
];

let ready: Promise<void> | null = null;

/** The database, with its tables in place. Throws if no D1 database is bound. */
export async function db(): Promise<D1Database> {
  const env = (await getCloudflareContext({ async: true })).env as unknown as { DB?: D1Database };
  const database = env.DB;
  if (!database) throw new Error("No D1 database is bound as DB (see wrangler.jsonc).");
  ready ??= database
    .batch(SCHEMA.map((sql) => database.prepare(sql)))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return database;
}
