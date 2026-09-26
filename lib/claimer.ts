import { type Db, getKv, setKv } from "./db.ts";
import { type LedgerOptions, recordClaim, upsertToken } from "./ledger.ts";
import { listTokens } from "./queries.ts";
import type { FeeSource } from "./sources/types.ts";
import type { PayoutProvider } from "./payouts/types.ts";
import { distributePending, type DistributionReport } from "./distribute.ts";

export type CycleReport = {
  discovered: number;
  claimed: { token: string; amountMicros: number; txHash: string | null }[];
  payoutsQueued: number;
  payoutsSent: number;
  distribution: DistributionReport;
  errors: { token?: string; payout?: number; message: string }[];
};

const CURSOR_KEY = "source_cursor";

/** Automatic mode: find new tokens, claim their fees, then distribute. (In manual mode claims come from /admin.) */
export async function runClaimCycle(db: Db, source: FeeSource, payouts: PayoutProvider, opts: LedgerOptions): Promise<CycleReport> {
  const report: CycleReport = { discovered: 0, claimed: [], payoutsQueued: 0, payoutsSent: 0, distribution: emptyReport(), errors: [] };

  const { tokens, cursor } = await source.discoverTokens(getKv(db, CURSOR_KEY));
  for (const t of tokens) upsertToken(db, t);
  if (cursor !== null) setKv(db, CURSOR_KEY, cursor);
  report.discovered = tokens.length;

  for (const token of listTokens(db, { limit: 200, sort: "new" })) {
    try {
      const { amountMicros, txHash } = await source.claim(token.address);
      if (amountMicros <= 0) continue;
      const { payoutId } = recordClaim(db, opts, token.address, amountMicros, txHash);
      report.claimed.push({ token: token.address, amountMicros, txHash });
      if (payoutId !== null) report.payoutsQueued++;
    } catch (e) {
      report.errors.push({ token: token.address, message: (e as Error).message });
    }
  }

  report.distribution = await distributePending(db, payouts);
  report.payoutsSent = report.distribution.sent.length;
  for (const e of report.distribution.errors) report.errors.push({ payout: e.id, message: e.message });
  return report;
}

function emptyReport(): DistributionReport {
  return { sent: [], failed: [], waiting: 0, needsReview: [], errors: [] };
}
