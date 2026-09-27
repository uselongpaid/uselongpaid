import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../lib/db.ts";
import { recordClaim, upsertToken } from "../lib/ledger.ts";
import { getAccount, getToken } from "../lib/queries.ts";
import { parseMilestones } from "../lib/milestones.ts";
import { isTokenAddress, isTxId, normalizeAddress } from "../lib/address.ts";

const MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const SIG = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";

test("Solana mints and signatures are recognised; EVM still works", () => {
  assert.ok(isTokenAddress(MINT));
  assert.ok(isTokenAddress("0x1Eef016F22A943abC7DD11422EDeE9D235942104"));
  assert.ok(!isTokenAddress("alice"));
  assert.ok(!isTokenAddress(MINT.replace("6", "0")), "0 isn't base58");
  assert.ok(isTxId(SIG));
  assert.ok(!isTxId(MINT));
  assert.equal(normalizeAddress(MINT), MINT, "base58 keeps its case");
  assert.equal(normalizeAddress("0xABCDEF"), "0xabcdef");
});

test("a Solana token keeps its exact address through the ledger", () => {
  const db = openDb(":memory:");
  const opts = { recipientShareBps: 8000, milestones: parseMilestones(undefined, undefined) };
  upsertToken(db, { address: MINT, chainId: 0, name: "Stonk", symbol: "STONK", handle: "alice", launchedAt: 0 });
  assert.equal(getToken(db, MINT)?.address, MINT);
  assert.equal(getToken(db, MINT.toLowerCase()), null, "base58 lookups are case-sensitive");

  const { payoutId } = recordClaim(db, opts, MINT, 10_000_000, SIG);
  assert.ok(payoutId);
  assert.equal(getAccount(db, "alice")!.lifetime_micros, 8_000_000);
  assert.equal(getToken(db, MINT)!.fees_micros, 10_000_000);
});
