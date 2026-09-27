import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { openDb } from "../lib/db.ts";
import { Launcher, LaunchError, launchFields, metadataJson, type BuildArgs, type LaunchDeps } from "../lib/launcher.ts";
import { chooseParams, DECIMALS, type BuiltLaunch, type Constraint } from "../lib/launchlab.ts";
import { StonkfunClient } from "../lib/stonkfun.ts";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
const UNIT = 10n ** BigInt(DECIMALS);

/** Stands in for the LaunchLab builder: a transaction paid by the wallet and signed by a fresh mint key. */
async function fakeBuild(a: BuildArgs): Promise<BuiltLaunch> {
  const mint = Keypair.generate();
  const msg = new TransactionMessage({
    payerKey: a.wallet,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.createAccount({ fromPubkey: a.wallet, newAccountPubkey: mint.publicKey, lamports: 1, space: 0, programId: SystemProgram.programId })],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([mint]);
  return {
    tx,
    mint: mint.publicKey,
    pool: Keypair.generate().publicKey,
    params: { curveType: 0, migrateType: "cpmm", creatorFeeOn: 0, supply: 1n, totalSellA: 1n, totalFundRaisingB: 1n, totalLockedAmount: 0n, cliffPeriod: 0n, unlockPeriod: 0n },
  };
}

function setup(over: Partial<LaunchDeps> = {}) {
  const sent: Uint8Array[] = [];
  const built: BuildArgs[] = [];
  let status: "confirmed" | "failed" | "pending" = "confirmed";
  let now = 1_000_000;
  const l = new Launcher({
    db: openDb(":memory:"),
    build: async (a) => (built.push(a), fakeBuild(a)),
    pricing: async () => ({ totalFundRaisingB: 85n }),
    listed: async () => true,
    send: async (raw) => (sent.push(raw), "sig"),
    status: async () => status,
    now: () => now,
    ...over,
  });
  return { l, sent, built, setStatus: (s: typeof status) => (status = s), tick: (ms: number) => (now += ms) };
}

const form = (wallet: string) => ({ wallet, handle: "@Alice", name: "Moon", symbol: "$moon", description: "to the moon", image: "https://x.io/a.png", quoteMint: USDC });
const sign = (b64: string, kp: Keypair) => {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
  tx.sign([kp]);
  return Buffer.from(tx.serialize()).toString("base64");
};

test("launchFields validates and ends the bio with fees @handle", () => {
  const f = launchFields(form(USDC));
  assert.equal(f.handle, "alice");
  assert.equal(f.symbol, "MOON");
  assert.equal(f.description, "to the moon\n\nfees @alice");
  assert.equal(launchFields({ ...form(USDC), description: "gm fees @bob" }).description, "gm\n\nfees @alice");
  assert.equal(launchFields({ ...form(USDC), handle: "" }).description, "to the moon");
  assert.throws(() => launchFields({ ...form(USDC), image: "javascript:alert(1)" }), LaunchError);
  assert.throws(() => launchFields({ ...form(USDC), quoteMint: "nope" }), LaunchError);
  assert.throws(() => launchFields({ ...form(USDC), website: "http://insecure.example" }), LaunchError);
});

test("a launch is built for the wallet, signed by it, sent, confirmed and then listed", async () => {
  const user = Keypair.generate();
  const { l, sent, built } = setup();
  const { row, transaction } = await l.prepare(form(user.publicKey.toBase58()), (id) => `https://site.test/api/launch/${id}/metadata`);
  assert.equal(row.status, "prepared");
  assert.ok(row.mint);
  assert.equal(built[0].uri, `https://site.test/api/launch/${row.id}/metadata`);
  assert.equal(built[0].hints.totalFundRaisingB, 85n, "stonkfun's pricing reaches the builder");
  assert.deepEqual(metadataJson(row, "https://img").description, "to the moon\n\nfees @alice");

  await assert.rejects(l.submit(row.id, transaction), /didn't sign/);
  const sub = await l.submit(row.id, sign(transaction, user));
  assert.equal(sub.status, "submitted");
  assert.equal(sent.length, 1);
  const done = (await l.refresh(row.id))!;
  assert.equal(done.status, "completed");
  assert.equal(done.listed, 1);
});

test("only the exact built transaction is relayed", async () => {
  const user = Keypair.generate();
  const { l, sent } = setup();
  const { row } = await l.prepare(form(user.publicKey.toBase58()), () => "https://m");
  const other = (await fakeBuild({ wallet: user.publicKey, quoteMint: new PublicKey(USDC), name: "x", symbol: "X", uri: "", hints: {} })).tx;
  other.sign([user]);
  await assert.rejects(l.submit(row.id, Buffer.from(other.serialize()).toString("base64")), /isn't the one that was built/);
  assert.equal(sent.length, 0);
});

test("late signatures expire; failed and dropped launches are reported", async () => {
  const user = Keypair.generate();
  const s = setup();
  const a = await s.l.prepare(form(user.publicKey.toBase58()), () => "https://m");
  s.tick(120_000);
  assert.equal((await s.l.submit(a.row.id, sign(a.transaction, user))).status, "failed");

  const b = await s.l.prepare(form(user.publicKey.toBase58()), () => "https://m");
  await s.l.submit(b.row.id, sign(b.transaction, user));
  s.setStatus("failed");
  assert.match((await s.l.refresh(b.row.id))!.error!, /failed on Solana/);

  const c = await s.l.prepare(form(user.publicKey.toBase58()), () => "https://m");
  await s.l.submit(c.row.id, sign(c.transaction, user));
  s.setStatus("pending");
  assert.equal((await s.l.refresh(c.row.id))!.status, "submitted");
  s.tick(4 * 60_000);
  assert.equal((await s.l.refresh(c.row.id))!.status, "failed");
});

test("a builder error fails the launch with its message", async () => {
  const { l } = setup({ build: async () => Promise.reject(new Error("No curve parameters fit")) });
  await assert.rejects(l.prepare(form(Keypair.generate().publicKey.toBase58()), () => "https://m"), /No curve parameters fit/);
});

test("chooseParams follows the platform's curve rule", () => {
  const cfg = { curveType: 0, minFundRaisingB: 30n * 10n ** 9n };
  // No rule: documented defaults, raise from the pricing hint.
  const d = chooseParams([], { totalFundRaisingB: 85n * 10n ** 9n }, cfg);
  assert.equal(d.supply, 1_000_000_000n * UNIT);
  assert.equal(d.totalSellA, 793_100_000n * UNIT);
  assert.equal(d.totalFundRaisingB, 85n * 10n ** 9n);
  assert.equal(d.migrateType, "cpmm");

  // Eq constraints pin values; ranges clamp the hint.
  const rule: Constraint[][] = [
    [
      { field: 3, op: 0, value: 1_000_000_000n * UNIT },
      { field: 4, op: 0, value: 793_100_000n * UNIT },
      { field: 5, op: 1, value: 100n },
      { field: 5, op: 2, value: 200n },
      { field: 9, op: 0, value: 1n },
    ],
  ];
  assert.equal(chooseParams(rule, { totalFundRaisingB: 50n }, cfg).totalFundRaisingB, 100n);
  assert.equal(chooseParams(rule, { totalFundRaisingB: 150n }, cfg).totalFundRaisingB, 150n);

  // A group that can't be met (spl-token base mint only) is skipped for one that can.
  const two: Constraint[][] = [[{ field: 9, op: 0, value: 0n }], [{ field: 5, op: 0, value: 42n }]];
  assert.equal(chooseParams(two, {}, cfg).totalFundRaisingB, 42n);
  assert.throws(() => chooseParams([[{ field: 9, op: 0, value: 0n }]], {}, cfg), /No curve parameters fit/);
});

test("StonkfunClient reads pairs, pricing and listing", async () => {
  const fake = (async (url: string) => {
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (url.endsWith("/pairs?launchable=true")) return json({ pairs: [{ quoteMint: USDC, symbol: "USDC", name: "USD Coin", category: "crypto" }, { junk: 1 }] });
    if (url.includes("/launchlab/pricing?quoteMint=")) return json({ pricing: { supply: "1000000000000000", totalSellA: 793100000000000, raise: "85000000000", configId: USDC } });
    if (url.endsWith(`/tokens/${USDC}`)) return json({ mint: USDC });
    if (url.includes("/tokens/")) return json({ error: "not found" }, 404);
    return json({ error: "boom" }, 503);
  }) as typeof fetch;
  const c = new StonkfunClient("https://api.test/v1/", fake);
  assert.deepEqual(await c.pairs(), [{ mint: USDC, symbol: "USDC", name: "USD Coin", logo: null, category: "crypto" }]);
  assert.deepEqual(await c.pricing(USDC), { supply: 1_000_000_000_000_000n, totalSellA: 793_100_000_000_000n, totalFundRaisingB: 85_000_000_000n, configId: USDC });
  assert.equal(await c.listed(USDC), true);
  assert.equal(await c.listed("So11111111111111111111111111111111111111112"), false);
});
