import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { openDb } from "../lib/db.ts";
import { getDetected, getToken, listDetected } from "../lib/queries.ts";
import { FACTORY_ABI, poolDataFromLaunchInput, poolDataIncludes, type LaunchedToken } from "../lib/long/factory.ts";
import { registerDetected, syncLaunches, type LaunchReader } from "../lib/long/sync.ts";
import type { TokenMetadata } from "../lib/handle.ts";

const OURS = "0x00000000000000000000000000000000000000Aa";
const LONG_PROTOCOL = "0x2121212121212121212121212121212121212121";
const OTHER = "0x3333333333333333333333333333333333333333";
const word = (a: string) => a.toLowerCase().slice(2).padStart(64, "0");
const num = (n: bigint) => n.toString(16).padStart(64, "0");

/** Pool data shaped like long.xyz's: some config words, then a 2-entry beneficiary array. */
function poolData(receiver: string): Hex {
  return `0x${[num(32n), num(1000n), word(LONG_PROTOCOL), num(5n * 10n ** 16n), word(receiver), num(95n * 10n ** 16n)].join("")}`;
}

function launchInput(receiver: string): Hex {
  return encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: "launch",
    args: [
      {
        initialSupply: 10n ** 27n,
        numTokensToSell: 10n ** 27n,
        numeraire: OTHER,
        tokenFactory: OTHER,
        tokenFactoryData: "0x",
        governanceFactory: OTHER,
        governanceFactoryData: "0x",
        poolInitializer: OTHER,
        poolInitializerData: poolData(receiver),
        liquidityMigrator: OTHER,
        liquidityMigratorData: "0x",
        integrator: OTHER,
        salt: `0x${"00".repeat(32)}`,
      },
      { launcher: OTHER, paramsHash: `0x${"11".repeat(32)}`, expectedAsset: OTHER, deadline: 1n },
      "0x1234",
    ],
  });
}

type FakeLaunch = LaunchedToken & { receiver: string; meta: TokenMetadata | null };

function fake(launches: FakeLaunch[], head = 1000n, failRangesOver = 0n) {
  const calls: [bigint, bigint][] = [];
  const reader: LaunchReader = {
    head: async () => head,
    launches: async (from, to) => {
      calls.push([from, to]);
      if (failRangesOver && to - from + 1n > failRangesOver) throw new Error("block range too large");
      return launches.filter((l) => l.blockNumber >= from && l.blockNumber <= to);
    },
    launchInput: async (hash) => launchInput(launches.find((l) => l.txHash === hash)!.receiver),
    blockTime: async (b) => Number(b) * 1000,
  };
  const fetchMeta = async (uri: string) => launches.find((l) => l.tokenURI === uri)?.meta ?? null;
  return { reader, fetchMeta, calls };
}

let n = 0;
function launch(block: bigint, receiver: string, meta: TokenMetadata | null): FakeLaunch {
  n++;
  const hex = n.toString(16).padStart(36, "0") + "1e18";
  return {
    asset: `0x${hex}` as Address,
    launcher: OTHER,
    name: `Token ${n}`,
    symbol: `TK${n}`,
    tokenURI: `ipfs://meta${n}`,
    numeraire: OTHER,
    txHash: `0x${n.toString(16).padStart(64, "0")}` as Hex,
    blockNumber: block,
    receiver,
    meta,
  };
}

const opts = { feeWallets: [OURS], excludeHandles: ["longpaid"], chainId: 4663, startBlock: 100n };

test("poolDataIncludes matches whole words only", () => {
  assert.equal(poolDataIncludes(poolData(OURS), [OURS]), OURS);
  assert.equal(poolDataIncludes(poolData(OTHER), [OURS]), null);
  // An address that only appears as part of a longer word must not match.
  const shifted = `0x${word(OURS).slice(2)}00` as Hex;
  assert.equal(poolDataIncludes(shifted, [OURS]), null);
  assert.equal(poolDataFromLaunchInput(launchInput(OURS)), poolData(OURS));
});

test("launches routed to LongPaid with a bio handle are registered automatically", async () => {
  const db = openDb(":memory:");
  const mine = launch(150n, OURS, { name: "Moon", description: "to the moon. fees @Alice", image: "ipfs://img1" });
  const notMine = launch(160n, OTHER, { description: "fees @bob" });
  const { reader, fetchMeta } = fake([mine, notMine]);

  const r = await syncLaunches(db, reader, fetchMeta, opts);
  assert.equal(r.scanned, 2);
  assert.equal(r.routedToUs, 1);
  assert.deepEqual(r.registered.map((x) => x.handle), ["alice"]);
  assert.ok(r.caughtUp);

  const t = getToken(db, mine.asset)!;
  assert.equal(t.handle, "alice");
  assert.equal(t.launched_at, 150_000);
  assert.match(t.image ?? "", /^https:\/\/.+\/img1$/);
  assert.equal(getToken(db, notMine.asset), null, "a bio alone can't route fees to us");
  assert.equal(getDetected(db, notMine.asset), null);
});

test("routed launches without a usable handle wait for the admin", async () => {
  const db = openDb(":memory:");
  const noBio = launch(120n, OURS, { description: "gm" });
  const onlyUs = launch(121n, OURS, { description: "fees @longpaid" });
  const { reader, fetchMeta } = fake([noBio, onlyUs]);

  const r = await syncLaunches(db, reader, fetchMeta, opts);
  assert.equal(r.needsHandle.length, 2);
  assert.equal(listDetected(db, "needs_handle").length, 2);

  registerDetected(db, noBio.asset, "carol", 4663);
  assert.equal(getToken(db, noBio.asset)!.handle, "carol");
  assert.equal(getDetected(db, noBio.asset)!.status, "registered");
});

test("unreachable metadata is retried, then handed to the admin", async () => {
  const db = openDb(":memory:");
  const l = launch(130n, OURS, null);
  const { reader, fetchMeta } = fake([l]);
  for (let i = 0; i < 4; i++) await syncLaunches(db, reader, fetchMeta, { ...opts, maxMetadataAttempts: 5 });
  assert.equal(getDetected(db, l.asset)!.status, "pending");
  await syncLaunches(db, reader, fetchMeta, { ...opts, maxMetadataAttempts: 5 });
  assert.equal(getDetected(db, l.asset)!.status, "needs_handle");
});

test("the cursor advances, reruns don't duplicate, and oversized ranges are split", async () => {
  const db = openDb(":memory:");
  const l = launch(900n, OURS, { description: "fees @dave" });
  const f = fake([l], 1000n, 300n);
  const r1 = await syncLaunches(db, f.reader, f.fetchMeta, opts);
  assert.ok(r1.caughtUp);
  assert.equal(r1.registered.length, 1);
  assert.ok(f.calls.every(([a, b]) => b >= a));
  assert.ok(f.calls.some(([a, b]) => b - a + 1n <= 300n), "shrank the range after the RPC refused a large one");

  const r2 = await syncLaunches(db, f.reader, f.fetchMeta, opts);
  assert.equal(r2.scanned, 0);
  assert.equal(r2.registered.length, 0);
  assert.equal(listDetected(db).length, 1);
});

test("metadata URLs try several IPFS gateways for any IPFS form", async () => {
  const { metadataUrls } = await import("../lib/long/factory.ts");
  const cid = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
  for (const u of [`ipfs://${cid}`, cid, `https://example.mypinata.cloud/ipfs/${cid}`]) {
    const urls = metadataUrls(u);
    assert.ok(urls.length >= 3, u);
    assert.ok(urls.every((x) => x.includes(cid)));
  }
  assert.equal(metadataUrls(`https://example.mypinata.cloud/ipfs/${cid}`)[0], `https://example.mypinata.cloud/ipfs/${cid}`);
  assert.deepEqual(metadataUrls("https://api.example.com/meta/1.json"), ["https://api.example.com/meta/1.json"]);
});

test("launches through other long.xyz entry points are still recognised", async () => {
  const { feeWalletInLaunch } = await import("../lib/long/factory.ts");
  const ours = "0x13A05697e39F0a2b3638154a1cF85e59d85A05d3";
  const word = (hex: string) => hex.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  // Unknown selector 0xb0da329a, wallet nested at a 4-byte offset (like calldata inside a router call).
  const input = `0xb0da329a${word("0x40")}${"00".repeat(4)}${word(ours)}${word("0x1234")}` as `0x${string}`;
  assert.equal(feeWalletInLaunch(input, [ours]), ours);
  const other = `0xb0da329a${word("0x40")}${word("0x9999999999999999999999999999999999999999")}` as `0x${string}`;
  assert.equal(feeWalletInLaunch(other, [ours]), null);
});
