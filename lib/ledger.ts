import { type Db, tx } from "./db.ts";
import { normalizeAddress } from "./address.ts";
import { splitClaim } from "./money.ts";
import { highestReached, type Milestones, nextMilestone } from "./milestones.ts";

export type TokenRecord = {
  address: string;
  chainId: number;
  name: string;
  symbol: string;
  image?: string | null;
  handle: string;
  creator?: string | null;
  launchedAt: number;
};

export type LedgerOptions = { recipientShareBps: number; milestones: Milestones };

export function upsertToken(db: Db, t: TokenRecord) {
  db.prepare(
    `INSERT INTO tokens (address, chain_id, name, symbol, image, handle, creator, launched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET name = excluded.name, symbol = excluded.symbol,
       image = excluded.image, handle = excluded.handle`,
  ).run(normalizeAddress(t.address), t.chainId, t.name, t.symbol, t.image ?? null, t.handle, t.creator ?? null, t.launchedAt);
  ensureAccount(db, t.handle);
}

function ensureAccount(db: Db, handle: string) {
  db.prepare("INSERT OR IGNORE INTO accounts (handle, created_at) VALUES (?, ?)").run(handle, Date.now());
}

/**
 * Records fees claimed for a token: splits them between the X account and the burn,
 * credits the account, and queues a payout when lifetime earnings cross a milestone.
 * Returns the queued payout id, if any.
 */
export function recordClaim(
  db: Db,
  opts: LedgerOptions,
  tokenAddress: string,
  amountMicros: number,
  txHash: string | null,
  note: string | null = null,
): { claimId: number; payoutId: number | null } {
  if (!Number.isInteger(amountMicros) || amountMicros <= 0) throw new Error("claim amount must be positive");
  return tx(db, () => {
    if (txHash && db.prepare("SELECT 1 FROM claims WHERE tx_hash = ?").get(txHash)) {
      throw new Error(`transaction ${txHash} is already recorded`);
    }
    const token = db.prepare("SELECT handle FROM tokens WHERE address = ?").get(normalizeAddress(tokenAddress)) as
      | { handle: string }
      | undefined;
    if (!token) throw new Error(`unknown token ${tokenAddress}`);
    const account = db.prepare("SELECT opted_out FROM accounts WHERE handle = ?").get(token.handle) as
      | { opted_out: number }
      | undefined;

    // An opted-out account never receives funds; its whole share is burned instead.
    const { recipient, burn } = account?.opted_out
      ? { recipient: 0, burn: amountMicros }
      : splitClaim(amountMicros, opts.recipientShareBps);
    const now = Date.now();

    const claim = db
      .prepare(
        `INSERT INTO claims (token, handle, amount_micros, recipient_micros, burn_micros, tx_hash, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(normalizeAddress(tokenAddress), token.handle, amountMicros, recipient, burn, txHash, note, now);
    db.prepare("UPDATE tokens SET fees_micros = fees_micros + ? WHERE address = ?").run(amountMicros, normalizeAddress(tokenAddress));
    db.prepare(
      "UPDATE accounts SET balance_micros = balance_micros + ?, lifetime_micros = lifetime_micros + ? WHERE handle = ?",
    ).run(recipient, recipient, token.handle);
    if (burn > 0) {
      db.prepare("INSERT INTO burns (amount_micros, status, created_at) VALUES (?, 'pending', ?)").run(burn, now);
    }

    const payoutId = maybeQueuePayout(db, token.handle, opts.milestones);
    return { claimId: Number(claim.lastInsertRowid), payoutId };
  });
}

function maybeQueuePayout(db: Db, handle: string, milestones: Milestones): number | null {
  const acc = db
    .prepare("SELECT balance_micros, lifetime_micros, milestone_micros FROM accounts WHERE handle = ?")
    .get(handle) as { balance_micros: number; lifetime_micros: number; milestone_micros: number };
  if (acc.lifetime_micros < nextMilestone(acc.milestone_micros, milestones)) return null;
  // One claim can cross several milestones; record the highest so each is only paid once.
  db.prepare("UPDATE accounts SET milestone_micros = ? WHERE handle = ?").run(highestReached(acc.lifetime_micros, milestones), handle);
  if (acc.balance_micros <= 0) return null;
  // Move the whole balance into the payout so it can't be paid twice.
  db.prepare("UPDATE accounts SET balance_micros = 0 WHERE handle = ?").run(handle);
  const r = db
    .prepare("INSERT INTO payouts (handle, amount_micros, status, created_at) VALUES (?, ?, 'queued', ?)")
    .run(handle, acc.balance_micros, Date.now());
  return Number(r.lastInsertRowid);
}

export function settlePayout(db: Db, id: number, result: { ok: true; ref: string } | { ok: false; reason: string }) {
  tx(db, () => {
    const p = db.prepare("SELECT handle, amount_micros, status FROM payouts WHERE id = ?").get(id) as
      | { handle: string; amount_micros: number; status: string }
      | undefined;
    if (!p) throw new Error(`unknown payout ${id}`);
    if (p.status !== "queued") throw new Error(`payout ${id} is already ${p.status}`);
    if (result.ok) {
      db.prepare("UPDATE payouts SET status = 'paid', provider_ref = ?, settled_at = ?, attempted_at = NULL WHERE id = ?").run(
        result.ref,
        Date.now(),
        id,
      );
      db.prepare("UPDATE accounts SET paid_micros = paid_micros + ? WHERE handle = ?").run(p.amount_micros, p.handle);
    } else {
      // Return the money to the balance; it goes out with the next milestone payout.
      db.prepare("UPDATE payouts SET status = 'failed', provider_ref = ?, settled_at = ?, attempted_at = NULL WHERE id = ?").run(
        result.reason,
        Date.now(),
        id,
      );
      db.prepare("UPDATE accounts SET balance_micros = balance_micros + ? WHERE handle = ?").run(p.amount_micros, p.handle);
    }
  });
}

export function setOptOut(db: Db, handle: string, optedOut: boolean) {
  ensureAccount(db, handle);
  db.prepare("UPDATE accounts SET opted_out = ? WHERE handle = ?").run(optedOut ? 1 : 0, handle);
}

/** Links (or clears) the wallet an account's automatic payouts are sent to. */
export function setWallet(db: Db, handle: string, wallet: string | null) {
  ensureAccount(db, handle);
  db.prepare("UPDATE accounts SET wallet = ? WHERE handle = ?").run(wallet, handle);
}

/** Records that a pending buyback-and-burn was executed. */
export function markBurnDone(db: Db, id: number, txHash: string) {
  const r = db.prepare("UPDATE burns SET status = 'done', tx_hash = ? WHERE id = ? AND status = 'pending'").run(txHash, id);
  if (r.changes === 0) throw new Error(`burn ${id} is not pending`);
}

/** Marks every pending burn as done with one transaction (a single buyback can cover many claims). */
export function markAllBurnsDone(db: Db, txHash: string): number {
  return Number(db.prepare("UPDATE burns SET status = 'done', tx_hash = ? WHERE status = 'pending'").run(txHash).changes);
}

/** Clears a stuck in-flight marker after an admin has checked the payout didn't go out. */
export function resetPayoutAttempt(db: Db, id: number) {
  const r = db.prepare("UPDATE payouts SET attempted_at = NULL, attempt_ref = NULL WHERE id = ? AND status = 'queued'").run(id);
  if (r.changes === 0) throw new Error(`payout ${id} is not queued`);
}

export type LinkRequest = { handle: string; wallet: string; message: string; signature: string; code: string; tweetUrl: string };

/** Stores a wallet-link request. A repeat from the same handle and wallet replaces the pending one. */
export function createLinkRequest(db: Db, r: LinkRequest): number {
  return tx(db, () => {
    const pending = db.prepare("SELECT COUNT(*) AS n FROM wallet_links WHERE status = 'pending'").get() as { n: number };
    if (pending.n >= 1000) throw new Error("too many pending requests, try again later");
    db.prepare("DELETE FROM wallet_links WHERE status = 'pending' AND handle = ? AND wallet = ?").run(r.handle, r.wallet);
    const res = db
      .prepare(
        `INSERT INTO wallet_links (handle, wallet, message, signature, code, tweet_url, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(r.handle, r.wallet, r.message, r.signature, r.code, r.tweetUrl, Date.now());
    return Number(res.lastInsertRowid);
  });
}

/** Approving sets the account's payout wallet and closes other pending requests for that handle. */
export function decideLinkRequest(db: Db, id: number, approve: boolean): { handle: string; wallet: string } {
  return tx(db, () => {
    const r = db.prepare("SELECT handle, wallet, status FROM wallet_links WHERE id = ?").get(id) as
      | { handle: string; wallet: string; status: string }
      | undefined;
    if (!r) throw new Error(`unknown request ${id}`);
    if (r.status !== "pending") throw new Error(`request ${id} is already ${r.status}`);
    const now = Date.now();
    db.prepare("UPDATE wallet_links SET status = ?, decided_at = ? WHERE id = ?").run(approve ? "approved" : "rejected", now, id);
    if (approve) {
      setWallet(db, r.handle, r.wallet);
      db.prepare("UPDATE wallet_links SET status = 'rejected', decided_at = ? WHERE handle = ? AND status = 'pending'").run(now, r.handle);
    }
    return { handle: r.handle, wallet: r.wallet };
  });
}
