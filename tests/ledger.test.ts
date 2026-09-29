import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../lib/db.ts";
import { recordClaim, setOptOut, settlePayout, upsertToken } from "../lib/ledger.ts";
import { getAccount, getStats, listPayouts } from "../lib/queries.ts";
import { runClaimCycle } from "../lib/claimer.ts";
import type { FeeSource } from "../lib/sources/types.ts";
import { ManualPayoutProvider } from "../lib/payouts/manual.ts";
import { parseMilestones } from "../lib/milestones.ts";

const opts = { recipientShareBps: 8000, milestones: parseMilestones(undefined, undefined) };
const token = { address: "0xABC", chainId: 1, name: "T", symbol: "T", handle: "alice", launchedAt: 0 };

test("claims credit the account and queue a payout at the milestone", async () => {
  const db = await openDb(":memory:");
  await upsertToken(db, token);

  assert.equal((await recordClaim(db, opts, "0xabc", 5_000_000, null)).payoutId, null);
  assert.equal((await getAccount(db, "alice"))!.balance_micros, 4_000_000);

  const { payoutId } = await recordClaim(db, opts, "0xabc", 10_000_000, "0x1");
  assert.ok(payoutId);
  assert.equal((await getAccount(db, "alice"))!.balance_micros, 0);
  assert.equal((await listPayouts(db, { status: "queued" }))[0].amount_micros, 12_000_000);

  await settlePayout(db, payoutId!, { ok: true, ref: "r1" });
  assert.equal((await getAccount(db, "alice"))!.paid_micros, 12_000_000);
  await assert.rejects(() => settlePayout(db, payoutId!, { ok: true, ref: "again" }), /already paid/);

  const s = await getStats(db);
  assert.equal(s.claimedMicros, 15_000_000);
  assert.equal(s.burnedMicros, 3_000_000);
  assert.equal(s.paidMicros, 12_000_000);
});

test("a failed payout returns money to the balance", async () => {
  const db = await openDb(":memory:");
  await upsertToken(db, token);
  const { payoutId } = await recordClaim(db, opts, "0xabc", 20_000_000, null);
  await settlePayout(db, payoutId!, { ok: false, reason: "no X Money" });
  assert.equal((await getAccount(db, "alice"))!.balance_micros, 16_000_000);
  assert.equal((await getAccount(db, "alice"))!.paid_micros, 0);
});

test("opted-out accounts receive nothing; the whole claim is burned", async () => {
  const db = await openDb(":memory:");
  await upsertToken(db, token);
  await setOptOut(db, "alice", true);
  await recordClaim(db, opts, "0xabc", 50_000_000, null);
  assert.equal((await getAccount(db, "alice"))!.lifetime_micros, 0);
  assert.equal((await getStats(db)).burnedMicros, 50_000_000);
});

test("claim cycle discovers tokens once and keeps the ledger balanced", async () => {
  const db = await openDb(":memory:");
  // Test double for the automatic (longxyz) mode: 3 tokens, each with $12 of fees per claim.
  const launched = ["a", "b", "c"].map((c, i) => ({
    address: "0x" + c.repeat(40), chainId: 1, name: c, symbol: c.toUpperCase(), handle: `h${i}`, launchedAt: i,
  }));
  let n = 0;
  const source: FeeSource = {
    async discoverTokens(cursor) {
      return { tokens: cursor ? [] : launched, cursor: "1" };
    },
    async claim() {
      n++;
      return { amountMicros: 12_000_000, txHash: "0x" + n.toString(16).padStart(64, "0") };
    },
    async inspect() {
      return { exists: true, name: null, symbol: null, handle: null, routesToTreasury: true, pendingMicros: null };
    },
  };
  const r1 = await runClaimCycle(db, source, new ManualPayoutProvider(), opts);
  const r2 = await runClaimCycle(db, source, new ManualPayoutProvider(), opts);
  assert.equal(r1.discovered, launched.length);
  assert.equal(r2.discovered, 0);
  assert.equal(r1.errors.length + r2.errors.length, 0);

  const row = (await db
    .prepare(
      `SELECT (SELECT SUM(amount_micros) FROM claims) AS claimed,
              (SELECT SUM(recipient_micros) FROM claims) AS recipient,
              (SELECT SUM(balance_micros) FROM accounts) AS balances,
              (SELECT COALESCE(SUM(amount_micros),0) FROM payouts) AS payouts,
              (SELECT SUM(burn_micros) FROM claims) AS burn`,
    )
    .get()) as Record<string, number>;
  assert.equal(row.recipient + row.burn, row.claimed);
  assert.equal(row.balances + row.payouts, row.recipient);
});

test("dailyFees buckets claims by UTC day and fills empty days", async () => {
  const { dailyFees, earningsByToken } = await import("../lib/queries.ts");
  const db = await openDb(":memory:");
  await upsertToken(db, token);
  const now = Date.UTC(2026, 8, 26, 12);
  await recordClaim(db, opts, "0xabc", 2_000_000, null);
  await recordClaim(db, opts, "0xabc", 3_000_000, null);
  await db.prepare("UPDATE claims SET created_at = ? WHERE id = 1").run(Date.UTC(2026, 8, 24, 23));
  await db.prepare("UPDATE claims SET created_at = ? WHERE id = 2").run(Date.UTC(2026, 8, 26, 1));

  const days = await dailyFees(db, 4, now);
  assert.deepEqual(days, [
    { day: "2026-09-23", micros: 0 },
    { day: "2026-09-24", micros: 2_000_000 },
    { day: "2026-09-25", micros: 0 },
    { day: "2026-09-26", micros: 3_000_000 },
  ]);
  assert.deepEqual(
    (await earningsByToken(db, "alice")).map((t) => [t.claims, t.earned]),
    [[2, 4_000_000]],
  );
});
