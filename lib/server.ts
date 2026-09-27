import "server-only";
import { config } from "./config.ts";
import { type Db, openDb } from "./db.ts";
import type { LedgerOptions } from "./ledger.ts";
import { LongXyzFeeSource } from "./sources/longxyz.ts";
import type { FeeSource } from "./sources/types.ts";
import type { PayoutProvider } from "./payouts/types.ts";
import { createPayoutProvider } from "./providers.ts";
import { ManualFeeSource } from "./sources/manual.ts";

const g = globalThis as unknown as { __db?: Db };

export function db(): Db {
  g.__db ??= openDb(config.databasePath);
  return g.__db;
}

export function ledgerOptions(): LedgerOptions {
  return { recipientShareBps: config.recipientShareBps, milestones: config.milestones };
}

export function feeSource(): FeeSource {
  if (config.feeSource === "longxyz") return new LongXyzFeeSource(config.long);
  return manualSource();
}

export function manualSource(): ManualFeeSource {
  return new ManualFeeSource(config.long.rpcUrl);
}

export function payoutProvider(): PayoutProvider {
  return createPayoutProvider();
}

/** Constant-time check of a bearer token against CRON_SECRET. */
export function authorized(req: Request): boolean {
  if (!config.cronSecret) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (given.length !== config.cronSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ config.cronSecret.charCodeAt(i);
  return diff === 0;
}
