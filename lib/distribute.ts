import type { Db } from "./db.ts";
import { settlePayout } from "./ledger.ts";
import type { PayoutProvider } from "./payouts/types.ts";

export type DistributionReport = {
  sent: { id: number; handle: string; amountMicros: number; ref: string }[];
  failed: { id: number; handle: string; reason: string }[];
  /** Queued, but the provider can't send yet (for example, no wallet linked). */
  waiting: number;
  /** A previous attempt may have gone out; an admin must check before it's retried. */
  needsReview: number[];
  errors: { id: number; message: string }[];
};

type Queued = { id: number; handle: string; amount_micros: number; attempted_at: number | null; wallet: string | null };

/**
 * Sends every queued payout through the provider. Runs automatically after each recorded claim,
 * after an account links a wallet, and from the distribute cron.
 *
 * Double-payment guard: a payout is marked in flight before it's handed to the provider. If the process
 * dies or the provider throws mid-send, the marker stays and the payout is skipped until an admin checks it,
 * unless the provider is retry-safe (it dedupes on the payout id).
 */
export async function distributePending(db: Db, provider: PayoutProvider, opts: { handle?: string } = {}): Promise<DistributionReport> {
  const report: DistributionReport = { sent: [], failed: [], waiting: 0, needsReview: [], errors: [] };
  const rows = db
    .prepare(
      `SELECT p.id, p.handle, p.amount_micros, p.attempted_at, a.wallet
       FROM payouts p LEFT JOIN accounts a ON a.handle = p.handle
       WHERE p.status = 'queued' ${opts.handle ? "AND p.handle = ?" : ""} ORDER BY p.id LIMIT 500`,
    )
    .all(...(opts.handle ? [opts.handle] : [])) as Queued[];

  for (const p of rows) {
    if (p.attempted_at !== null && !provider.retrySafe) {
      report.needsReview.push(p.id);
      continue;
    }
    // Claim the payout for this run; a concurrent run sees attempted_at and skips it.
    const claimed = db
      .prepare("UPDATE payouts SET attempted_at = ? WHERE id = ? AND status = 'queued' AND (attempted_at IS NULL OR ?)")
      .run(Date.now(), p.id, provider.retrySafe ? 1 : 0);
    if (claimed.changes === 0) continue;

    try {
      const result = await provider.send(
        { id: p.id, handle: p.handle, amountMicros: p.amount_micros, wallet: p.wallet },
        { onBroadcast: (ref) => db.prepare("UPDATE payouts SET attempt_ref = ? WHERE id = ?").run(ref, p.id) },
      );
      if (result === null) {
        db.prepare("UPDATE payouts SET attempted_at = NULL WHERE id = ?").run(p.id);
        report.waiting++;
        continue;
      }
      settlePayout(db, p.id, result);
      if (result.ok) report.sent.push({ id: p.id, handle: p.handle, amountMicros: p.amount_micros, ref: result.ref });
      else report.failed.push({ id: p.id, handle: p.handle, reason: result.reason });
    } catch (e) {
      // `notSent` means the provider knows nothing left (e.g. a failed simulation), so a retry is safe.
      if (provider.retrySafe || (e as { notSent?: boolean }).notSent) {
        db.prepare("UPDATE payouts SET attempted_at = NULL, attempt_ref = NULL WHERE id = ?").run(p.id);
      } else {
        report.needsReview.push(p.id);
      }
      report.errors.push({ id: p.id, message: (e as Error).message });
    }
  }
  return report;
}
