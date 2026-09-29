// Database: libSQL. In production a hosted Turso database (DATABASE_URL=libsql://…, DATABASE_AUTH_TOKEN), so the app
// runs on serverless hosts like Netlify; locally and in tests a SQLite file (file:…). The small async wrapper below
// keeps the familiar prepare(sql).get/all/run shape.

import type { Client, Config, InArgs, ResultSet, Transaction } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tokens (
  address      TEXT PRIMARY KEY,
  chain_id     INTEGER NOT NULL,
  name         TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  image        TEXT,
  handle       TEXT NOT NULL,
  creator      TEXT,
  launched_at  INTEGER NOT NULL,
  fees_micros  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tokens_handle ON tokens(handle);

CREATE TABLE IF NOT EXISTS accounts (
  handle           TEXT PRIMARY KEY,
  balance_micros   INTEGER NOT NULL DEFAULT 0,
  lifetime_micros  INTEGER NOT NULL DEFAULT 0,
  paid_micros      INTEGER NOT NULL DEFAULT 0,
  opted_out        INTEGER NOT NULL DEFAULT 0,
  -- Highest payout milestone already crossed (micro-dollars of lifetime earnings).
  milestone_micros INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  token             TEXT NOT NULL REFERENCES tokens(address),
  handle            TEXT NOT NULL,
  amount_micros     INTEGER NOT NULL,
  recipient_micros  INTEGER NOT NULL,
  burn_micros       INTEGER NOT NULL,
  tx_hash           TEXT,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS claims_handle ON claims(handle);
CREATE INDEX IF NOT EXISTS claims_token ON claims(token);

CREATE TABLE IF NOT EXISTS payouts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  handle         TEXT NOT NULL,
  amount_micros  INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('queued','paid','failed')),
  provider_ref   TEXT,
  created_at     INTEGER NOT NULL,
  settled_at     INTEGER
);

CREATE TABLE IF NOT EXISTS burns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_micros  INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending','done')),
  tx_hash        TEXT,
  created_at     INTEGER NOT NULL
);

-- Requests to link an X handle to a payout wallet; an admin approves after checking the X post.
CREATE TABLE IF NOT EXISTS wallet_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  handle      TEXT NOT NULL,
  wallet      TEXT NOT NULL,
  message     TEXT NOT NULL,
  signature   TEXT NOT NULL,
  code        TEXT NOT NULL,
  tweet_url   TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS wallet_links_status ON wallet_links(status);

-- long.xyz launches whose fees are routed to a LongPaid wallet, found by scanning the factory.
CREATE TABLE IF NOT EXISTS detected_launches (
  asset        TEXT PRIMARY KEY,
  tx_hash      TEXT NOT NULL,
  block        INTEGER NOT NULL,
  launched_at  INTEGER NOT NULL,
  launcher     TEXT NOT NULL,
  name         TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  token_uri    TEXT NOT NULL,
  fee_wallet   TEXT NOT NULL,
  handle       TEXT,
  status       TEXT NOT NULL CHECK (status IN ('pending','registered','needs_handle','dismissed')),
  note         TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  detected_at  INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS detected_launches_status ON detected_launches(status);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

type Value = string | number | bigint | null | Uint8Array | boolean;
type Executor = Client | Transaction;

export type Statement = {
  get<T = Record<string, unknown>>(...args: Value[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...args: Value[]): Promise<T[]>;
  run(...args: Value[]): Promise<{ changes: number; lastInsertRowid: number }>;
};

export interface Db {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  /** Runs `fn` in one write transaction; everything it does through `t` commits or rolls back together. */
  transaction<T>(fn: (t: Db) => Promise<T>): Promise<T>;
  close(): void;
}

function rows(rs: ResultSet): Record<string, unknown>[] {
  return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));
}

function wrap(ex: Executor, client: Client): Db {
  const run = (sql: string, args: Value[]) => ex.execute({ sql, args: args as InArgs });
  return {
    prepare(sql) {
      return {
        async get<T>(...args: Value[]) {
          return rows(await run(sql, args))[0] as T | undefined;
        },
        async all<T>(...args: Value[]) {
          return rows(await run(sql, args)) as T[];
        },
        async run(...args: Value[]) {
          const r = await run(sql, args);
          return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
        },
      };
    },
    async exec(sql) {
      await ex.executeMultiple(sql);
    },
    async transaction(fn) {
      if (ex !== client) return fn(this); // already inside one
      const t = await client.transaction("write");
      try {
        const out = await fn(wrap(t, client));
        await t.commit();
        return out;
      } catch (e) {
        await t.rollback().catch(() => {});
        throw e;
      } finally {
        t.close();
      }
    },
    close() {
      client.close();
    },
  };
}

/**
 * Opens (and creates or migrates) the database. `url` is a libsql:// URL, a file: URL, a plain file path, or
 * ":memory:" (a fresh temporary file, since libSQL transactions need a real file).
 */
export async function openDb(url: string, authToken?: string): Promise<Db> {
  let u = url.trim();
  const remote = /^(libsql|https?|wss?):\/\//i.test(u);
  if (!remote && (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)) {
    throw new Error(
      "DATABASE_URL isn't set to a hosted database. On Netlify set DATABASE_URL (libsql://…turso.io) and DATABASE_AUTH_TOKEN " +
        "in Site configuration → Environment variables, then redeploy.",
    );
  }
  if (u === ":memory:") u = `file:${join(tmpdir(), `longpaid-${randomUUID()}.db`)}`;
  else if (!remote && !/^file:/i.test(u)) {
    mkdirSync(dirname(u), { recursive: true });
    u = `file:${u}`;
  }
  // A hosted database only needs HTTP: the web client has no native module, so it bundles cleanly into serverless
  // functions. The node client (which loads the native libsql module) is only used for local files.
  const { createClient } = (remote ? await import("@libsql/client/web") : await import("@libsql/client")) as {
    createClient(c: Config): Client;
  };
  const client = createClient({ url: u, authToken: authToken || undefined });
  const db = wrap(client, client);
  if (u.startsWith("file:")) await db.exec("PRAGMA journal_mode = WAL;").catch(() => {});
  await db.exec("PRAGMA foreign_keys = ON;").catch(() => {});
  await db.exec(SCHEMA);
  await migrate(db);
  return db;
}

async function addColumn(db: Db, table: string, column: string, type: string) {
  const cols = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (!cols.some((c) => c.name === column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

async function migrate(db: Db) {
  await addColumn(db, "accounts", "milestone_micros", "INTEGER NOT NULL DEFAULT 0");
  // Wallet the account owner linked (after signing in with X) for automatic payouts.
  await addColumn(db, "accounts", "wallet", "TEXT");
  // Set just before a payout is handed to the provider; cleared once it settles or is safe to retry.
  await addColumn(db, "payouts", "attempted_at", "INTEGER");
  // Transaction hash or reference returned while a payout is in flight.
  await addColumn(db, "payouts", "attempt_ref", "TEXT");
  // Free-form note from the dev who recorded the claim (asset amount, price used, etc.).
  await addColumn(db, "claims", "note", "TEXT");
  // A claim transaction can only be recorded once.
  await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS claims_tx ON claims(tx_hash) WHERE tx_hash IS NOT NULL");
}

/** Runs `fn` in one write transaction. */
export function tx<T>(db: Db, fn: (t: Db) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export async function getKv(db: Db, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM kv WHERE key = ?").get<{ value: string }>(key);
  return row?.value ?? null;
}

export async function setKv(db: Db, key: string, value: string): Promise<void> {
  await db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
