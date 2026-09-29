import type { Db } from "./db.ts";

export type Stats = { claimedMicros: number; paidMicros: number; burnedMicros: number; tokens: number; accounts: number };

export async function getStats(db: Db): Promise<Stats> {
  const c = await db.prepare("SELECT COALESCE(SUM(amount_micros),0) AS claimed, COALESCE(SUM(burn_micros),0) AS burned FROM claims").get() as {
    claimed: number;
    burned: number;
  };
  const p = await db.prepare("SELECT COALESCE(SUM(amount_micros),0) AS paid FROM payouts WHERE status = 'paid'").get() as { paid: number };
  const t = await db.prepare("SELECT COUNT(*) AS n FROM tokens").get() as { n: number };
  const a = await db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE lifetime_micros > 0").get() as { n: number };
  return { claimedMicros: c.claimed, paidMicros: p.paid, burnedMicros: c.burned, tokens: t.n, accounts: a.n };
}

export type TokenRow = {
  address: string;
  chain_id: number;
  name: string;
  symbol: string;
  image: string | null;
  handle: string;
  creator: string | null;
  launched_at: number;
  fees_micros: number;
};

export async function listTokens(
  db: Db,
  opts: { limit?: number; sort?: "fees" | "new"; q?: string; handle?: string } = {},
): Promise<TokenRow[]> {
  const order = opts.sort === "new" ? "launched_at DESC" : "fees_micros DESC, launched_at DESC";
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  if (opts.handle) {
    return await db.prepare(`SELECT * FROM tokens WHERE handle = ? ORDER BY ${order} LIMIT ?`).all(opts.handle, limit) as TokenRow[];
  }
  if (opts.q) {
    const like = `%${opts.q.toLowerCase()}%`;
    return await db
      .prepare(
        `SELECT * FROM tokens WHERE lower(name) LIKE ? OR lower(symbol) LIKE ? OR handle LIKE ? OR address LIKE ?
         ORDER BY ${order} LIMIT ?`,
      )
      .all(like, like, like, like, limit) as TokenRow[];
  }
  return await db.prepare(`SELECT * FROM tokens ORDER BY ${order} LIMIT ?`).all(limit) as TokenRow[];
}

export async function getToken(db: Db, address: string): Promise<TokenRow | null> {
  return (await db.prepare("SELECT * FROM tokens WHERE address = ?").get(address.toLowerCase()) as TokenRow | undefined) ?? null;
}

export async function tokenTotals(db: Db, address: string) {
  return await db
    .prepare(
      `SELECT COUNT(*) AS claims, COALESCE(SUM(recipient_micros),0) AS recipient, COALESCE(SUM(burn_micros),0) AS burn
       FROM claims WHERE token = ?`,
    )
    .get(address.toLowerCase()) as { claims: number; recipient: number; burn: number };
}

export type AccountRow = {
  handle: string;
  balance_micros: number;
  lifetime_micros: number;
  paid_micros: number;
  opted_out: number;
  milestone_micros: number;
  wallet: string | null;
  created_at: number;
};

export async function getAccount(db: Db, handle: string): Promise<AccountRow | null> {
  return (await db.prepare("SELECT * FROM accounts WHERE handle = ?").get(handle) as AccountRow | undefined) ?? null;
}

export async function topAccounts(db: Db, limit = 25): Promise<AccountRow[]> {
  return await db
    .prepare("SELECT * FROM accounts WHERE lifetime_micros > 0 ORDER BY lifetime_micros DESC LIMIT ?")
    .all(limit) as AccountRow[];
}

export type ClaimRow = {
  id: number;
  token: string;
  handle: string;
  amount_micros: number;
  recipient_micros: number;
  burn_micros: number;
  tx_hash: string | null;
  note: string | null;
  created_at: number;
  symbol: string;
};

export async function recentClaims(db: Db, opts: { handle?: string; token?: string; limit?: number } = {}): Promise<ClaimRow[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.handle) {
    where.push("c.handle = ?");
    args.push(opts.handle);
  }
  if (opts.token) {
    where.push("c.token = ?");
    args.push(opts.token.toLowerCase());
  }
  args.push(opts.limit ?? 20);
  return await db
    .prepare(
      `SELECT c.*, t.symbol FROM claims c JOIN tokens t ON t.address = c.token
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
    )
    .all(...args) as ClaimRow[];
}

export type PayoutRow = {
  id: number;
  handle: string;
  amount_micros: number;
  status: "queued" | "paid" | "failed";
  provider_ref: string | null;
  attempted_at: number | null;
  attempt_ref: string | null;
  created_at: number;
  settled_at: number | null;
};

export async function listPayouts(db: Db, opts: { handle?: string; status?: PayoutRow["status"]; limit?: number } = {}): Promise<PayoutRow[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.handle) {
    where.push("handle = ?");
    args.push(opts.handle);
  }
  if (opts.status) {
    where.push("status = ?");
    args.push(opts.status);
  }
  args.push(opts.limit ?? 50);
  return await db
    .prepare(`SELECT * FROM payouts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`)
    .all(...args) as PayoutRow[];
}

const DAY_MS = 86_400_000;

/** Fees claimed per UTC day for the last `days` days, oldest first, with empty days filled in. */
export async function dailyFees(db: Db, days = 14, now = Date.now()): Promise<{ day: string; micros: number }[]> {
  const end = Math.floor(now / DAY_MS) * DAY_MS;
  const start = end - (days - 1) * DAY_MS;
  const rows = await db
    .prepare(
      `SELECT (created_at / ${DAY_MS}) * ${DAY_MS} AS d, SUM(amount_micros) AS micros
       FROM claims WHERE created_at >= ? GROUP BY d`,
    )
    .all(start) as { d: number; micros: number }[];
  const byDay = new Map(rows.map((r) => [r.d, r.micros]));
  return Array.from({ length: days }, (_, i) => {
    const d = start + i * DAY_MS;
    return { day: new Date(d).toISOString().slice(0, 10), micros: byDay.get(d) ?? 0 };
  });
}

/** What an account earned from each of its tokens. */
export async function earningsByToken(db: Db, handle: string) {
  return await db
    .prepare(
      `SELECT t.address, t.symbol, t.name, COUNT(c.id) AS claims, COALESCE(SUM(c.recipient_micros),0) AS earned
       FROM tokens t LEFT JOIN claims c ON c.token = t.address AND c.handle = t.handle
       WHERE t.handle = ? GROUP BY t.address ORDER BY earned DESC`,
    )
    .all(handle) as { address: string; symbol: string; name: string; claims: number; earned: number }[];
}

export type BurnRow = { id: number; amount_micros: number; status: "pending" | "done"; tx_hash: string | null; created_at: number };

export async function listBurns(db: Db, status?: BurnRow["status"], limit = 100): Promise<BurnRow[]> {
  return (
    status
      ? await db.prepare("SELECT * FROM burns WHERE status = ? ORDER BY id DESC LIMIT ?").all(status, limit)
      : await db.prepare("SELECT * FROM burns ORDER BY id DESC LIMIT ?").all(limit)
  ) as BurnRow[];
}

export async function pendingBurnMicros(db: Db): Promise<number> {
  return (await db.prepare("SELECT COALESCE(SUM(amount_micros),0) AS n FROM burns WHERE status = 'pending'").get() as { n: number }).n;
}

export type LinkRow = {
  id: number;
  handle: string;
  wallet: string;
  code: string;
  tweet_url: string;
  status: "pending" | "approved" | "rejected";
  created_at: number;
  decided_at: number | null;
};

export async function listLinkRequests(db: Db, opts: { status?: LinkRow["status"]; wallet?: string; limit?: number } = {}): Promise<LinkRow[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.status) {
    where.push("status = ?");
    args.push(opts.status);
  }
  if (opts.wallet) {
    where.push("lower(wallet) = lower(?)");
    args.push(opts.wallet);
  }
  args.push(opts.limit ?? 100);
  return await db
    .prepare(
      `SELECT id, handle, wallet, code, tweet_url, status, created_at, decided_at FROM wallet_links
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`,
    )
    .all(...args) as LinkRow[];
}

/** Accounts whose payouts go to this wallet. */
export async function accountsForWallet(db: Db, wallet: string): Promise<AccountRow[]> {
  return await db.prepare("SELECT * FROM accounts WHERE lower(wallet) = lower(?) ORDER BY lifetime_micros DESC").all(wallet) as AccountRow[];
}

export type DetectedRow = {
  asset: string;
  tx_hash: string;
  block: number;
  launched_at: number;
  launcher: string;
  name: string;
  symbol: string;
  token_uri: string;
  fee_wallet: string;
  handle: string | null;
  status: "pending" | "registered" | "needs_handle" | "dismissed";
  note: string | null;
  attempts: number;
  detected_at: number;
};

export async function listDetected(db: Db, status?: DetectedRow["status"], limit = 50): Promise<DetectedRow[]> {
  return (
    status
      ? await db.prepare("SELECT * FROM detected_launches WHERE status = ? ORDER BY block DESC LIMIT ?").all(status, limit)
      : await db.prepare("SELECT * FROM detected_launches ORDER BY block DESC LIMIT ?").all(limit)
  ) as DetectedRow[];
}

export async function getDetected(db: Db, asset: string): Promise<DetectedRow | null> {
  return (await db.prepare("SELECT * FROM detected_launches WHERE asset = ?").get(asset.toLowerCase()) as DetectedRow | undefined) ?? null;
}
