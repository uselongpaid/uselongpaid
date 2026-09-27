import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { openDb } from "../lib/db.ts";
import { Launcher, LaunchError, launchInput, type Stonkfun } from "../lib/launcher.ts";
import { StonkfunClient, StonkfunError, type LaunchStatus, type Prepared } from "../lib/stonkfun.ts";
import { lamportsOut } from "../lib/solana/tx.ts";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const STONKFUN_FEE = new PublicKey("AvVCE7Ue49iZjYzkkHz6ZhVyvY6NLHw67vB8eQaffVPz");
const MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

function paymentTx(payer: PublicKey, lamports: number): VersionedTransaction {
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: STONKFUN_FEE, lamports })],
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}
const b64 = (tx: VersionedTransaction) => Buffer.from(tx.serialize()).toString("base64");

class FakeStonkfun implements Stonkfun {
  prepared: { wallet: string; description: string }[] = [];
  n = 0;
  submitResult: LaunchStatus | Error = { state: "completed", mint: MINT, message: null, raw: {} };
  statusResult: LaunchStatus = { state: "completed", mint: MINT, message: null, raw: {} };
  async prepare(wallet: string, input: { description: string }): Promise<Prepared> {
    this.prepared.push({ wallet, description: input.description });
    return { transaction: b64(paymentTx(new PublicKey(wallet), 12_000_000 + this.n++)), quote: { id: "q1" }, raw: {} };
  }
  async submit(): Promise<LaunchStatus> {
    if (this.submitResult instanceof Error) throw this.submitResult;
    return this.submitResult;
  }
  async launch(): Promise<LaunchStatus> {
    return this.statusResult;
  }
}

const form = (wallet: string) => ({ wallet, handle: "@Alice", name: "Moon", symbol: "$moon", description: "to the moon", image: "https://x.io/a.png", quoteMint: USDC });

test("launchInput validates and ends the bio with fees @handle", () => {
  const { handle, input } = launchInput(form(MINT));
  assert.equal(handle, "alice");
  assert.equal(input.symbol, "MOON");
  assert.equal(input.description, "to the moon\n\nfees @alice");
  assert.equal(launchInput({ ...form(MINT), description: "gm fees @bob" }).input.description, "gm\n\nfees @alice");
  assert.equal(launchInput({ ...form(MINT), handle: "" }).input.description, "to the moon");
  assert.throws(() => launchInput({ ...form(MINT), image: "javascript:alert(1)" }), LaunchError);
  assert.throws(() => launchInput({ ...form(MINT), quoteMint: "nope" }), LaunchError);
  assert.throws(() => launchInput({ ...form(MINT), website: "http://insecure.example" }), LaunchError);
});

test("a wallet-signed launch is relayed and completes with the mint", async () => {
  const user = Keypair.generate();
  const sf = new FakeStonkfun();
  const l = new Launcher(openDb(":memory:"), sf);
  const { row, transaction } = await l.prepare(form(user.publicKey.toBase58()));
  assert.equal(sf.prepared[0].wallet, user.publicKey.toBase58(), "stonkfun prepares for the user's wallet");
  assert.equal(row.cost_lamports, 12_000_000 + 5000, "launch fee plus network fee");

  const tx = VersionedTransaction.deserialize(Buffer.from(transaction, "base64"));
  await assert.rejects(l.submit(row.id, b64(tx)), /didn't sign/);
  tx.sign([user]);
  const done = await l.submit(row.id, b64(tx));
  assert.equal(done.status, "completed");
  assert.equal(done.mint, MINT);
  assert.ok(done.launch_sig);
});

test("only the exact prepared transaction is accepted", async () => {
  const user = Keypair.generate();
  const l = new Launcher(openDb(":memory:"), new FakeStonkfun());
  const { row } = await l.prepare(form(user.publicKey.toBase58()));
  const other = paymentTx(user.publicKey, 999_000_000);
  other.sign([user]);
  await assert.rejects(l.submit(row.id, b64(other)), /isn't the one that was prepared/);
  assert.equal(l.get(row.id)!.status, "prepared");
});

test("a late signature expires the launch; rejections fail it; slow ones are polled", async () => {
  let now = 1_000_000;
  const user = Keypair.generate();
  const sf = new FakeStonkfun();
  const l = new Launcher(openDb(":memory:"), sf, () => now);
  const sign = (t: string) => {
    const tx = VersionedTransaction.deserialize(Buffer.from(t, "base64"));
    tx.sign([user]);
    return b64(tx);
  };

  const a = await l.prepare(form(user.publicKey.toBase58()));
  now += 120_000;
  assert.equal((await l.submit(a.row.id, sign(a.transaction))).status, "failed");

  const b = await l.prepare(form(user.publicKey.toBase58()));
  sf.submitResult = new StonkfunError("stonkfun 400: symbol taken", 400, {});
  const rb = await l.submit(b.row.id, sign(b.transaction));
  assert.equal(rb.status, "failed");
  assert.match(rb.error!, /symbol taken/);

  const c = await l.prepare(form(user.publicKey.toBase58()));
  sf.submitResult = { state: "processing", mint: null, message: null, raw: {} };
  assert.equal((await l.submit(c.row.id, sign(c.transaction))).status, "submitted");
  assert.equal((await l.refresh(c.row.id))!.status, "completed");
  assert.equal(l.get(c.row.id)!.mint, MINT);
});

test("a prepared launch for someone else's wallet is refused", async () => {
  const user = Keypair.generate();
  const sf = new FakeStonkfun();
  sf.prepare = async () => ({ transaction: b64(paymentTx(Keypair.generate().publicKey, 1)), quote: null, raw: {} });
  await assert.rejects(new Launcher(openDb(":memory:"), sf).prepare(form(user.publicKey.toBase58())), /different wallet/);
});

test("StonkfunClient reads pairs, the prepared transaction and launch status", async () => {
  const tx = b64(paymentTx(Keypair.generate().publicKey, 5));
  const calls: { url: string; body?: string }[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (url.endsWith("/pairs?launchable=true")) return json({ pairs: [{ quoteMint: USDC, symbol: "USDC", name: "USD Coin", category: "crypto" }, { junk: 1 }] });
    if (url.endsWith("/launches/prepare")) return json({ quote: { id: "q" }, payment: { transaction: tx } });
    if (url.endsWith("/launches/submit")) return json({ status: "processing" });
    if (url.includes("/launches/sig1")) return json({ status: "completed", token: { mint: MINT } });
    if (url.includes("/launches/bad")) return json({ error: "no such launch" }, 404);
    return json({}, 500);
  }) as typeof fetch;
  const c = new StonkfunClient("https://api.test/v1/", fake);

  assert.deepEqual(await c.pairs(), [{ mint: USDC, symbol: "USDC", name: "USD Coin", logo: null, category: "crypto" }]);
  const p = await c.prepare("W", { name: "M", symbol: "M", description: "d", image: "i", quoteMint: USDC }, "r1");
  assert.equal(p.transaction, tx);
  assert.equal(JSON.parse(calls[1].body!).requestId, "r1");
  assert.equal((await c.submit(p, "signed")).state, "processing");
  assert.deepEqual(JSON.parse(calls[2].body!), { signedTransaction: "signed", quote: { id: "q" } });
  const s = await c.launch("sig1");
  assert.equal(s.state, "completed");
  assert.equal(s.mint, MINT);
  await assert.rejects(c.launch("bad"), /stonkfun 404: no such launch/);
});

test("lamportsOut counts transfers from the payer plus the network fee", () => {
  const payer = Keypair.generate().publicKey;
  assert.equal(lamportsOut(paymentTx(payer, 7), payer), 7n + 5000n);
  assert.equal(lamportsOut(paymentTx(payer, 7), Keypair.generate().publicKey), 0n);
});
