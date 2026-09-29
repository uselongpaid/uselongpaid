import type { Hex } from "viem";
import { type Db, getKv, setKv } from "../db.ts";
import { upsertToken } from "../ledger.ts";
import { feeHandleFromMetadata, type TokenMetadata } from "../handle.ts";
import { metadataUrls, type LaunchedToken, feeWalletInLaunch } from "./factory.ts";

function imageUrl(meta: TokenMetadata): string | null {
  const raw = typeof meta.image === "string" && meta.image ? meta.image : typeof meta.image_hash === "string" ? meta.image_hash : "";
  return raw ? (metadataUrls(raw)[0] ?? null) : null;
}

/** What the scanner needs from the chain (a viem-backed implementation lives in reader.ts). */
export interface LaunchReader {
  head(): Promise<bigint>;
  /** LaunchMetadata logs in [from, to]. May throw when the range is too large for the RPC. */
  launches(from: bigint, to: bigint): Promise<LaunchedToken[]>;
  launchInput(txHash: Hex): Promise<Hex>;
  /** Block timestamp in milliseconds. */
  blockTime(block: bigint): Promise<number>;
}

export type MetadataFetcher = (tokenURI: string) => Promise<TokenMetadata | null>;

export type SyncOptions = {
  /** Wallets that receive fees for LongPaid (the long.xyz wallet of LongPaid's X account). */
  feeWallets: string[];
  /** Handles never credited from a bio (LongPaid's own account). */
  excludeHandles: string[];
  chainId: number;
  /** First block to scan when there's no cursor yet; defaults to the current head. */
  startBlock?: bigint;
  /** Stop after this many log ranges per run so a long catch-up doesn't block. */
  maxRanges?: number;
  maxMetadataAttempts?: number;
};

export type SyncReport = {
  from: string;
  to: string;
  scanned: number;
  routedToUs: number;
  registered: { asset: string; symbol: string; handle: string }[];
  needsHandle: { asset: string; symbol: string; reason: string }[];
  caughtUp: boolean;
  errors: string[];
};

const CURSOR = "longxyz_factory_cursor";
const MIN_CHUNK = 250n;
const MAX_CHUNK = 50_000n;

/**
 * Scans long.xyz's factory for new launches. A launch counts as LongPaid's only when one of our fee wallets
 * is a fee beneficiary in the launch transaction itself; the bio can't fake that. The bio then says which
 * X account gets the 80%: "fees @handle". Tokens with both are registered automatically; routed tokens
 * without a readable handle wait in /admin.
 */
export async function syncLaunches(db: Db, reader: LaunchReader, fetchMeta: MetadataFetcher, opts: SyncOptions): Promise<SyncReport> {
  const head = await reader.head();
  const saved = getKv(db, CURSOR);
  let from = saved !== null ? BigInt(saved) + 1n : (opts.startBlock ?? head);
  const report: SyncReport = {
    from: from.toString(),
    to: from.toString(),
    scanned: 0,
    routedToUs: 0,
    registered: [],
    needsHandle: [],
    caughtUp: false,
    errors: [],
  };
  if (saved === null && from > head) from = head;

  let chunk = 10_000n;
  let ranges = 0;
  const maxRanges = opts.maxRanges ?? 200;
  while (from <= head && ranges < maxRanges) {
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    let found: LaunchedToken[];
    try {
      found = await reader.launches(from, to);
    } catch (e) {
      if (chunk > MIN_CHUNK) {
        chunk /= 2n; // range too large for the RPC: retry smaller
        continue;
      }
      report.errors.push(`logs ${from}-${to}: ${(e as Error).message.split("\n")[0]}`);
      break;
    }
    ranges++;
    for (const l of found) {
      report.scanned++;
      try {
        if (await recordIfOurs(db, reader, l, opts)) report.routedToUs++;
      } catch (e) {
        // Don't advance past a launch we couldn't inspect; the next run retries this range.
        report.errors.push(`${l.asset}: ${(e as Error).message.split("\n")[0]}`);
        report.to = (from - 1n).toString();
        await resolvePending(db, fetchMeta, opts, report);
        return report;
      }
    }
    setKv(db, CURSOR, to.toString());
    report.to = to.toString();
    from = to + 1n;
    if (chunk < MAX_CHUNK) chunk *= 2n;
  }
  report.caughtUp = from > head;
  await resolvePending(db, fetchMeta, opts, report);
  return report;
}

async function recordIfOurs(db: Db, reader: LaunchReader, l: LaunchedToken, opts: SyncOptions): Promise<boolean> {
  const asset = l.asset.toLowerCase();
  if (db.prepare("SELECT 1 FROM detected_launches WHERE asset = ?").get(asset)) return true;
  const wallet = feeWalletInLaunch(await reader.launchInput(l.txHash), opts.feeWallets);
  if (!wallet) return false;
  const now = Date.now();
  db.prepare(
    `INSERT INTO detected_launches (asset, tx_hash, block, launched_at, launcher, name, symbol, token_uri, fee_wallet, status, detected_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(
    asset,
    l.txHash,
    Number(l.blockNumber),
    await reader.blockTime(l.blockNumber),
    l.launcher.toLowerCase(),
    l.name,
    l.symbol,
    l.tokenURI,
    wallet.toLowerCase(),
    now,
    now,
  );
  return true;
}

type Pending = { asset: string; name: string; symbol: string; token_uri: string; launched_at: number; launcher: string; attempts: number };

/** Reads one detected launch's metadata right away (the checker calls this) instead of waiting for the next scan. */
export async function resolveAsset(db: Db, fetchMeta: MetadataFetcher, opts: SyncOptions, asset: string): Promise<SyncReport> {
  const report: SyncReport = { from: "0", to: "0", scanned: 0, routedToUs: 0, registered: [], needsHandle: [], caughtUp: true, errors: [] };
  const a = asset.toLowerCase();
  // Give a launch whose metadata was unreachable another round of attempts.
  db.prepare("UPDATE detected_launches SET status = 'pending', attempts = 0, note = NULL WHERE asset = ? AND status = 'needs_handle' AND note = 'metadata unreachable'").run(a);
  await resolvePending(db, fetchMeta, opts, report, a);
  return report;
}

async function resolvePending(db: Db, fetchMeta: MetadataFetcher, opts: SyncOptions, report: SyncReport, only?: string) {
  const maxAttempts = opts.maxMetadataAttempts ?? 5;
  const rows = (
    only
      ? db.prepare("SELECT * FROM detected_launches WHERE status = 'pending' AND asset = ?").all(only)
      : db.prepare("SELECT * FROM detected_launches WHERE status = 'pending' ORDER BY block LIMIT 100").all()
  ) as Pending[];
  for (const r of rows) {
    let meta: TokenMetadata | null = null;
    try {
      meta = await fetchMeta(r.token_uri);
    } catch {
      meta = null;
    }
    const now = Date.now();
    if (!meta) {
      const attempts = r.attempts + 1;
      const giveUp = attempts >= maxAttempts;
      db.prepare("UPDATE detected_launches SET attempts = ?, status = ?, note = ?, updated_at = ? WHERE asset = ?").run(
        attempts,
        giveUp ? "needs_handle" : "pending",
        giveUp ? "metadata unreachable" : null,
        now,
        r.asset,
      );
      if (giveUp) report.needsHandle.push({ asset: r.asset, symbol: r.symbol, reason: "metadata unreachable" });
      continue;
    }
    const handle = feeHandleFromMetadata(meta, opts.excludeHandles);
    if (!handle) {
      db.prepare("UPDATE detected_launches SET status = 'needs_handle', note = ?, updated_at = ? WHERE asset = ?").run(
        "no 'fees @handle' in the bio",
        now,
        r.asset,
      );
      report.needsHandle.push({ asset: r.asset, symbol: r.symbol, reason: "no 'fees @handle' in the bio" });
      continue;
    }
    registerDetected(db, r.asset, handle, opts.chainId, imageUrl(meta));
    report.registered.push({ asset: r.asset, symbol: r.symbol, handle });
  }
}

/** Registers a detected launch as a LongPaid token paying `handle` (also used by the admin for manual fixes). */
export function registerDetected(db: Db, asset: string, handle: string, chainId: number, image: string | null = null) {
  const r = db.prepare("SELECT * FROM detected_launches WHERE asset = ?").get(asset.toLowerCase()) as Pending | undefined;
  if (!r) throw new Error(`unknown launch ${asset}`);
  upsertToken(db, {
    address: r.asset,
    chainId,
    name: r.name,
    symbol: r.symbol,
    image,
    handle,
    creator: r.launcher,
    launchedAt: r.launched_at,
  });
  db.prepare("UPDATE detected_launches SET status = 'registered', handle = ?, note = NULL, updated_at = ? WHERE asset = ?").run(
    handle,
    Date.now(),
    r.asset,
  );
}
