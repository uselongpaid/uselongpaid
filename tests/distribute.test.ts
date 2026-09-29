import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../lib/db.ts";
import { recordClaim, resetPayoutAttempt, setWallet, upsertToken } from "../lib/ledger.ts";
import { distributePending } from "../lib/distribute.ts";
import { parseMilestones } from "../lib/milestones.ts";
import { getAccount, listPayouts } from "../lib/queries.ts";
import type { PayoutProvider, PayoutRequest } from "../lib/payouts/types.ts";
import { microsToUnits } from "../lib/payouts/erc20.ts";
import { parseUsd } from "../lib/money.ts";

const opts = { recipientShareBps: 8000, milestones: parseMilestones(undefined, undefined) };
const TOKEN = "0x00000000000000000000000000000000000000aa";

async function setup() {
  const db = await openDb(":memory:");
  await upsertToken(db, { address: TOKEN, chainId: 1, name: "Moon", symbol: "MOON", handle: "alice", launchedAt: 0 });
  await recordClaim(db, opts, TOKEN, 10_000_000, "0x" + "1".repeat(64)); // alice earns $8, crosses $5
  return db;
}

/** Pays only when a wallet is linked, like the stablecoin provider. */
function walletProvider(behavior: "ok" | "throw" | "notSent" = "ok", retrySafe = false) {
  const calls: PayoutRequest[] = [];
  const provider: PayoutProvider = {
    name: "fake",
    retrySafe,
    async send(p, hooks) {
      calls.push(p);
      if (!p.wallet) return null;
      if (behavior === "notSent") throw Object.assign(new Error("simulation failed"), { notSent: true });
      hooks?.onBroadcast?.("0xtx" + p.id);
      if (behavior === "throw") throw new Error("rpc timed out");
      return { ok: true, ref: "0xtx" + p.id };
    },
  };
  return { provider, calls };
}

test("payouts wait for a wallet, then go out once and only once", async () => {
  const db = await setup();
  const { provider, calls } = walletProvider();

  let r = await distributePending(db, provider);
  assert.equal(r.waiting, 1);
  assert.equal((await listPayouts(db, { status: "queued" }))[0].attempted_at, null);

  await setWallet(db, "alice", "0x1111111111111111111111111111111111111111");
  r = await distributePending(db, provider);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].amountMicros, 8_000_000);
  assert.equal((await getAccount(db, "alice"))!.paid_micros, 8_000_000);

  r = await distributePending(db, provider);
  assert.equal(r.sent.length + r.waiting, 0);
  assert.equal(calls.filter((c) => c.wallet).length, 1);
});

test("an ambiguous failure is held for review instead of paying twice", async () => {
  const db = await setup();
  await setWallet(db, "alice", "0x1111111111111111111111111111111111111111");
  const { provider, calls } = walletProvider("throw");

  let r = await distributePending(db, provider);
  assert.deepEqual(r.needsReview, [1]);
  const p = (await listPayouts(db, { status: "queued" }))[0];
  assert.ok(p.attempted_at);
  assert.equal(p.attempt_ref, "0xtx1");

  r = await distributePending(db, provider);
  assert.deepEqual(r.needsReview, [1]);
  assert.equal(calls.length, 1, "not sent again");

  await resetPayoutAttempt(db, 1);
  const ok = walletProvider("ok");
  r = await distributePending(db, ok.provider);
  assert.equal(r.sent.length, 1);
});

test("a failure the provider knows sent nothing is retried automatically", async () => {
  const db = await setup();
  await setWallet(db, "alice", "0x1111111111111111111111111111111111111111");
  const r = await distributePending(db, walletProvider("notSent").provider);
  assert.equal(r.needsReview.length, 0);
  assert.equal((await listPayouts(db, { status: "queued" }))[0].attempted_at, null);
});

test("retry-safe providers are retried after a throw", async () => {
  const db = await setup();
  await setWallet(db, "alice", "0x1111111111111111111111111111111111111111");
  const r = await distributePending(db, walletProvider("throw", true).provider);
  assert.equal(r.needsReview.length, 0);
  assert.equal((await listPayouts(db, { status: "queued" }))[0].attempted_at, null);
});

test("claims need a positive amount and a unique transaction", async () => {
  const db = await setup();
  await assert.rejects(() => recordClaim(db, opts, TOKEN, 0, "0x" + "2".repeat(64)), /positive/);
  await assert.rejects(() => recordClaim(db, opts, TOKEN, 5_000_000, "0x" + "1".repeat(64)), /already recorded/);
});

test("parseUsd and microsToUnits", async () => {
  assert.equal(parseUsd("125.40"), 125_400_000);
  assert.equal(parseUsd("$1,000"), 1_000_000_000);
  assert.equal(parseUsd("0.000001"), 1);
  assert.equal(parseUsd("1.0000001"), null);
  assert.equal(parseUsd("-5"), null);
  assert.equal(parseUsd("abc"), null);

  assert.equal(microsToUnits(8_000_000, 6), 8_000_000n);
  assert.equal(microsToUnits(8_000_000, 18), 8_000_000_000_000_000_000n);
  assert.equal(microsToUnits(8_000_000, 2), 800n);
});
