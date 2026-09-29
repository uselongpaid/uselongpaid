import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../lib/db.ts";
import { recordClaim, settlePayout, upsertToken } from "../lib/ledger.ts";
import { distributePending } from "../lib/distribute.ts";
import { parseMilestones } from "../lib/milestones.ts";
import { getAccount, listPayouts } from "../lib/queries.ts";
import { XMoneyPayoutProvider } from "../lib/payouts/xmoney.ts";

test("X Money payouts queue for the operator and need no wallet", async () => {
  const db = await openDb(":memory:");
  const opts = { recipientShareBps: 8000, milestones: parseMilestones(undefined, undefined) };
  await upsertToken(db, { address: "0x" + "a".repeat(40), chainId: 4663, name: "Moon", symbol: "MOON", handle: "alice", launchedAt: 0 });
  await recordClaim(db, opts, "0x" + "a".repeat(40), 10_000_000, "0x" + "1".repeat(64));

  const r = await distributePending(db, new XMoneyPayoutProvider());
  assert.equal(r.waiting, 1);
  assert.equal(r.sent.length, 0);
  const [p] = await listPayouts(db, { status: "queued" });
  assert.equal(p.handle, "alice");
  assert.equal(p.amount_micros, 8_000_000);
  assert.equal(p.attempted_at, null, "stays ready to send, not stuck in flight");

  // The operator sends it on X Money and marks it sent.
  await settlePayout(db, p.id, { ok: true, ref: "X Money" });
  assert.equal((await getAccount(db, "alice"))!.paid_micros, 8_000_000);
  assert.equal((await distributePending(db, new XMoneyPayoutProvider())).waiting, 0);
});
