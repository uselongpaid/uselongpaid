import { test } from "node:test";
import assert from "node:assert/strict";
import { highestReached, nextMilestone, parseMilestones } from "../lib/milestones.ts";
import { openDb } from "../lib/db.ts";
import { recordClaim, upsertToken } from "../lib/ledger.ts";
import { getAccount, listPayouts } from "../lib/queries.ts";

const m = parseMilestones(undefined, undefined);
const $ = (usd: number) => usd * 1_000_000;

test("next and highest milestones follow $5, $10 … $1,000, then every $1,000", async () => {
  assert.equal(nextMilestone(0, m), $(5));
  assert.equal(nextMilestone($(5), m), $(10));
  assert.equal(nextMilestone($(7), m), $(10));
  assert.equal(nextMilestone($(500), m), $(1000));
  assert.equal(nextMilestone($(1000), m), $(2000));
  assert.equal(nextMilestone($(3000), m), $(4000));

  assert.equal(highestReached($(4.99), m), 0);
  assert.equal(highestReached($(5), m), $(5));
  assert.equal(highestReached($(260), m), $(250));
  assert.equal(highestReached($(1999), m), $(1000));
  assert.equal(highestReached($(4500), m), $(4000));
});

test("parseMilestones rejects unsorted or non-positive lists", async () => {
  assert.throws(() => parseMilestones("10,5", "100"));
  assert.throws(() => parseMilestones("0,5", "100"));
  assert.throws(() => parseMilestones("5,10", "0"));
  assert.deepEqual(parseMilestones("1,2", "3"), { list: [$(1), $(2)], stepMicros: $(3) });
});

test("each milestone crossing pays the full balance once, even when one claim jumps several", async () => {
  const db = await openDb(":memory:");
  const opts = { recipientShareBps: 10_000, milestones: m };
  await upsertToken(db, { address: "0xA", chainId: 1, name: "A", symbol: "A", handle: "bob", launchedAt: 0 });

  assert.equal((await recordClaim(db, opts, "0xa", $(4), null)).payoutId, null); // $4 earned
  assert.ok((await recordClaim(db, opts, "0xa", $(2), null)).payoutId); // $6: crosses $5, pays $6
  assert.equal((await recordClaim(db, opts, "0xa", $(3), null)).payoutId, null); // $9: no crossing
  assert.ok((await recordClaim(db, opts, "0xa", $(100), null)).payoutId); // $109: crosses $10, $20, $50, $100 at once
  assert.equal((await recordClaim(db, opts, "0xa", $(1), null)).payoutId, null); // $110: next is $250

  assert.deepEqual(
    (await listPayouts(db, { handle: "bob" })).map((p) => p.amount_micros).reverse(),
    [$(6), $(103)],
  );
  const acc = (await getAccount(db, "bob"))!;
  assert.equal(acc.milestone_micros, $(100));
  assert.equal(acc.balance_micros, $(1));
});
