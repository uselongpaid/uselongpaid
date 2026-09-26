import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function addColumn(db: Db, table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function migrate(db: Db) {
  addColumn(db, "accounts", "milestone_micros", "INTEGER NOT NULL DEFAULT 0");
  // Wallet the account owner linked (after signing in with X) for automatic payouts.
  addColumn(db, "accounts", "wallet", "TEXT");
  // Set just before a payout is handed to the provider; cleared once it settles or is safe to retry.
  addColumn(db, "payouts", "attempted_at", "INTEGER");
  // Transaction hash or reference returned while a payout is in flight.
  addColumn(db, "payouts", "attempt_ref", "TEXT");
  // Free-form note from the dev who recorded the claim (asset amount, price used, etc.).
  addColumn(db, "claims", "note", "TEXT");
  // A claim transaction can only be recorded once.
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS claims_tx ON claims(tx_hash) WHERE tx_hash IS NOT NULL");
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getKv(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setKv(db: Db, key: string, value: string) {
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
