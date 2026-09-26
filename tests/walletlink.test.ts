import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { linkMessage, parseTweetUrl, verificationCode } from "../lib/walletlink.ts";
import { openDb } from "../lib/db.ts";
import { createLinkRequest, decideLinkRequest, recordClaim, upsertToken } from "../lib/ledger.ts";
import { getAccount, listLinkRequests } from "../lib/queries.ts";
import { distributePending } from "../lib/distribute.ts";
import { parseMilestones } from "../lib/milestones.ts";
import type { PayoutProvider } from "../lib/payouts/types.ts";

// Well-known test key (never holds funds).
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

test("the signed message proves the wallet, and the code is tied to the signature", async () => {
  const message = linkMessage({ appName: "Feeroute", handle: "alice", wallet: account.address, chainId: 4663, issuedAt: "2026-09-27T00:00:00.000Z" });
  assert.match(message, /X account: @alice/);
  assert.match(message, /Chain ID: 4663/);
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);

  // Changing the handle (someone reusing the signature for another account) fails verification.
  const other = message.replace("@alice", "@mallory");
  assert.equal(await verifyMessage({ address: account.address, message: other, signature }), false);

  const code = verificationCode(signature);
  assert.match(code, /^FR-[0-9A-F]{8}$/);
  assert.equal(verificationCode(signature), code);
});

test("parseTweetUrl only accepts status links under the same handle", () => {
  assert.equal(parseTweetUrl("https://x.com/Alice/status/1839000000000000001?s=20", "alice"), "https://x.com/Alice/status/1839000000000000001");
  assert.equal(parseTweetUrl("twitter.com/alice/status/1839000000000000001", "alice"), "https://x.com/alice/status/1839000000000000001");
  assert.equal(parseTweetUrl("https://x.com/bob/status/1839000000000000001", "alice"), null);
  assert.equal(parseTweetUrl("https://x.com/alice", "alice"), null);
  assert.equal(parseTweetUrl("https://evil.com/alice/status/1", "alice"), null);
});

test("approving a request sets the wallet, closes rivals, and releases waiting payouts", async () => {
  const db = openDb(":memory:");
  const opts = { recipientShareBps: 8000, milestones: parseMilestones(undefined, undefined) };
  upsertToken(db, { address: "0x" + "a".repeat(40), chainId: 4663, name: "Moon", symbol: "MOON", handle: "alice", launchedAt: 0 });
  recordClaim(db, opts, "0x" + "a".repeat(40), 10_000_000, "0x" + "1".repeat(64));

  const base = { handle: "alice", message: "m", signature: "0x01", code: "FR-00000000", tweetUrl: "https://x.com/alice/status/123456" };
  const good = createLinkRequest(db, { ...base, wallet: account.address });
  const rival = createLinkRequest(db, { ...base, wallet: "0x" + "9".repeat(40) });
  assert.equal(listLinkRequests(db, { status: "pending" }).length, 2);

  decideLinkRequest(db, good, true);
  assert.equal(getAccount(db, "alice")!.wallet, account.address);
  assert.equal(listLinkRequests(db, { status: "pending" }).length, 0);
  assert.throws(() => decideLinkRequest(db, rival, true), /already rejected/);

  const sentTo: (string | null)[] = [];
  const provider: PayoutProvider = {
    name: "t",
    retrySafe: false,
    async send(p) {
      sentTo.push(p.wallet);
      return p.wallet ? { ok: true, ref: "0xabc" } : null;
    },
  };
  const r = await distributePending(db, provider, { handle: "alice" });
  assert.equal(r.sent.length, 1);
  assert.deepEqual(sentTo, [account.address]);
});

test("a repeat request from the same handle and wallet replaces the pending one", () => {
  const db = openDb(":memory:");
  const r = { handle: "alice", wallet: account.address, message: "m", signature: "0x01", code: "FR-1", tweetUrl: "https://x.com/alice/status/123456" };
  createLinkRequest(db, r);
  createLinkRequest(db, { ...r, code: "FR-2" });
  const pending = listLinkRequests(db, { status: "pending" });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].code, "FR-2");
});
