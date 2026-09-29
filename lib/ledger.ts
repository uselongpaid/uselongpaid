import { type Db, tx } from "./db.ts";
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

export async function upsertToken(db: Db, t: TokenRecord): Promise<void> {
  await db.prepare(
    `INSERT INTO tokens (address, chain_id, name, symbol, image, handle, creator, launched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET name = excluded.name, symbol = excluded.symbol,
       image = excluded.image, handle = excluded.handle`,
  ).run(t.address.toLowerCase(), t.chainId, t.name, t.symbol, t.image ?? null, t.handle, t.creator ?? null, t.launchedAt);
  await ensureAccount(db, t.handle);
}

async function ensureAccount(db: Db, handle: string): Promise<void> {
  await db.prepare("INSERT OR IGNORE INTO accounts (handle, created_at) VALUES (?, ?)").run(handle, Date.now());
}

/**
 * Records fees claimed for a token: splits them between the X account and the burn,
 * credits the account, and queues a payout when lifetime earnings cross a milestone.
 * Returns the queued payout id, if any.
 */
export async function recordClaim(
  db: Db,
  opts: LedgerOptions,
  tokenAddress: string,
  amountMicros: number,
  txHash: string | null,
  note: string | null = null,
): Promise<{ claimId: number; payoutId: number | null }> {
  if (!Number.isInteger(amountMicros) || amountMicros <= 0) throw new Error("claim amount must be positive");
  return tx(db, async (t) => {
    if (txHash && await t.prepare("SELECT 1 FROM claims WHERE tx_hash = ?").get(txHash)) {
      throw new Error(`transaction ${txHash} is already recorded`);
    }
    const token = await t.prepare("SELECT handle FROM tokens WHERE address = ?").get(tokenAddress.toLowerCase()) as
      | { handle: string }
      | undefined;
    if (!token) throw new Error(`unknown token ${tokenAddress}`);
    const account = await t.prepare("SELECT opted_out FROM accounts WHERE handle = ?").get(token.handle) as
      | { opted_out: number }
      | undefined;

    // An opted-out account never receives funds; its whole share is burned instead.
    const { recipient, burn } = account?.opted_out
      ? { recipient: 0, burn: amountMicros }
      : splitClaim(amountMicros, opts.recipientShareBps);
    const now = Date.now();

    const claim = await t
      .prepare(
        `INSERT INTO claims (token, handle, amount_micros, recipient_micros, burn_micros, tx_hash, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(tokenAddress.toLowerCase(), token.handle, amountMicros, recipient, burn, txHash, note, now);
    await t.prepare("UPDATE tokens SET fees_micros = fees_micros + ? WHERE address = ?").run(amountMicros, tokenAddress.toLowerCase());
    await t.prepare(
      "UPDATE accounts SET balance_micros = balance_micros + ?, lifetime_micros = lifetime_micros + ? WHERE handle = ?",
    ).run(recipient, recipient, token.handle);
    if (burn > 0) {
      await t.prepare("INSERT INTO burns (amount_micros, status, created_at) VALUES (?, 'pending', ?)").run(burn, now);
    }

    const payoutId = await maybeQueuePayout(t, token.handle, opts.milestones);
    return { claimId: Number(claim.lastInsertRowid), payoutId };
  });
}

async function maybeQueuePayout(db: Db, handle: string, milestones: Milestones): Promise<number | null> {
  const acc = await db
    .prepare("SELECT balance_micros, lifetime_micros, milestone_micros FROM accounts WHERE handle = ?")
    .get(handle) as { balance_micros: number; lifetime_micros: number; milestone_micros: number };
  if (acc.lifetime_micros < nextMilestone(acc.milestone_micros, milestones)) return null;
  // One claim can cross several milestones; record the highest so each is only paid once.
  await db.prepare("UPDATE accounts SET milestone_micros = ? WHERE handle = ?").run(highestReached(acc.lifetime_micros, milestones), handle);
  if (acc.balance_micros <= 0) return null;
  // Move the whole balance into the payout so it can't be paid twice.
  await db.prepare("UPDATE accounts SET balance_micros = 0 WHERE handle = ?").run(handle);
  const r = await db
    .prepare("INSERT INTO payouts (handle, amount_micros, status, created_at) VALUES (?, ?, 'queued', ?)")
    .run(handle, acc.balance_micros, Date.now());
  return Number(r.lastInsertRowid);
}

export async function settlePayout(db: Db, id: number, result: { ok: true; ref: string } | { ok: false; reason: string }): Promise<void> {
  await tx(db, async (t) => {
    const p = await t.prepare("SELECT handle, amount_micros, status FROM payouts WHERE id = ?").get(id) as
      | { handle: string; amount_micros: number; status: string }
      | undefined;
    if (!p) throw new Error(`unknown payout ${id}`);
    if (p.status !== "queued") throw new Error(`payout ${id} is already ${p.status}`);
    if (result.ok) {
      await t.prepare("UPDATE payouts SET status = 'paid', provider_ref = ?, settled_at = ?, attempted_at = NULL WHERE id = ?").run(
        result.ref,
        Date.now(),
        id,
      );
      await t.prepare("UPDATE accounts SET paid_micros = paid_micros + ? WHERE handle = ?").run(p.amount_micros, p.handle);
    } else {
      // Return the money to the balance; it goes out with the next milestone payout.
      await t.prepare("UPDATE payouts SET status = 'failed', provider_ref = ?, settled_at = ?, attempted_at = NULL WHERE id = ?").run(
        result.reason,
        Date.now(),
        id,
      );
      await t.prepare("UPDATE accounts SET balance_micros = balance_micros + ? WHERE handle = ?").run(p.amount_micros, p.handle);
    }
  });
}

export async function setOptOut(db: Db, handle: string, optedOut: boolean): Promise<void> {
  await ensureAccount(db, handle);
  await db.prepare("UPDATE accounts SET opted_out = ? WHERE handle = ?").run(optedOut ? 1 : 0, handle);
}

/** Links (or clears) the wallet an account's automatic payouts are sent to. */
export async function setWallet(db: Db, handle: string, wallet: string | null): Promise<void> {
  await ensureAccount(db, handle);
  await db.prepare("UPDATE accounts SET wallet = ? WHERE handle = ?").run(wallet, handle);
}

/** Records that a pending buyback-and-burn was executed. */
export async function markBurnDone(db: Db, id: number, txHash: string): Promise<void> {
  const r = await db.prepare("UPDATE burns SET status = 'done', tx_hash = ? WHERE id = ? AND status = 'pending'").run(txHash, id);
  if (r.changes === 0) throw new Error(`burn ${id} is not pending`);
}

/** Marks every pending burn as done with one transaction (a single buyback can cover many claims). */
export async function markAllBurnsDone(db: Db, txHash: string): Promise<number> {
  return (await db.prepare("UPDATE burns SET status = 'done', tx_hash = ? WHERE status = 'pending'").run(txHash)).changes;
}

/** Clears a stuck in-flight marker after an admin has checked the payout didn't go out. */
export async function resetPayoutAttempt(db: Db, id: number): Promise<void> {
  const r = await db.prepare("UPDATE payouts SET attempted_at = NULL, attempt_ref = NULL WHERE id = ? AND status = 'queued'").run(id);
  if (r.changes === 0) throw new Error(`payout ${id} is not queued`);
}

export type LinkRequest = { handle: string; wallet: string; message: string; signature: string; code: string; tweetUrl: string };

/** Stores a wallet-link request. A repeat from the same handle and wallet replaces the pending one. */
export async function createLinkRequest(db: Db, r: LinkRequest): Promise<number> {
  return tx(db, async (t) => {
    const pending = await t.prepare("SELECT COUNT(*) AS n FROM wallet_links WHERE status = 'pending'").get() as { n: number };
    if (pending.n >= 1000) throw new Error("too many pending requests, try again later");
    await t.prepare("DELETE FROM wallet_links WHERE status = 'pending' AND handle = ? AND wallet = ?").run(r.handle, r.wallet);
    const res = await t
      .prepare(
        `INSERT INTO wallet_links (handle, wallet, message, signature, code, tweet_url, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(r.handle, r.wallet, r.message, r.signature, r.code, r.tweetUrl, Date.now());
    return Number(res.lastInsertRowid);
  });
}

/** Approving sets the account's payout wallet and closes other pending requests for that handle. */
export async function decideLinkRequest(db: Db, id: number, approve: boolean): Promise<{ handle: string; wallet: string }> {
  return tx(db, async (t) => {
    const r = await t.prepare("SELECT handle, wallet, status FROM wallet_links WHERE id = ?").get(id) as
      | { handle: string; wallet: string; status: string }
      | undefined;
    if (!r) throw new Error(`unknown request ${id}`);
    if (r.status !== "pending") throw new Error(`request ${id} is already ${r.status}`);
    const now = Date.now();
    await t.prepare("UPDATE wallet_links SET status = ?, decided_at = ? WHERE id = ?").run(approve ? "approved" : "rejected", now, id);
    if (approve) {
      await setWallet(t, r.handle, r.wallet);
      await t.prepare("UPDATE wallet_links SET status = 'rejected', decided_at = ? WHERE handle = ? AND status = 'pending'").run(now, r.handle);
    }
    return { handle: r.handle, wallet: r.wallet };
  });
}
