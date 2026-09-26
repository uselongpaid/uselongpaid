import { parseMilestones } from "./milestones.ts";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

export const config = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Feeroute",
  databasePath: process.env.DATABASE_PATH || "./data/feeroute.db",
  cronSecret: process.env.CRON_SECRET || "",
  recipientShareBps: num("RECIPIENT_SHARE_BPS", 8000),
  milestones: parseMilestones(process.env.PAYOUT_MILESTONES_USD, process.env.PAYOUT_MILESTONE_STEP_USD),
  feeSource: (process.env.FEE_SOURCE || "manual") as "manual" | "longxyz",
  payoutProvider: (process.env.PAYOUT_PROVIDER || "manual") as "manual" | "webhook" | "erc20",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  explorerTxUrl: process.env.EXPLORER_TX_URL || "",
  erc20: {
    rpcUrl: process.env.PAYOUT_RPC_URL || process.env.LONG_RPC_URL || "",
    chainId: num("PAYOUT_CHAIN_ID", num("LONG_CHAIN_ID", 0)),
    token: process.env.PAYOUT_TOKEN_ADDRESS || "",
    decimals: num("PAYOUT_TOKEN_DECIMALS", 6),
    privateKey: process.env.PAYOUT_PRIVATE_KEY || "",
  },
  payoutWebhookUrl: process.env.PAYOUT_WEBHOOK_URL || "",
  payoutWebhookSecret: process.env.PAYOUT_WEBHOOK_SECRET || "",
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET || "",
  xClientId: process.env.X_CLIENT_ID || "",
  xClientSecret: process.env.X_CLIENT_SECRET || "",
  long: {
    rpcUrl: process.env.LONG_RPC_URL || "",
    chainId: num("LONG_CHAIN_ID", 0),
    treasury: process.env.TREASURY_ADDRESS || "",
    privateKey: process.env.TREASURY_PRIVATE_KEY || "",
    feeContract: process.env.LONG_FEE_CONTRACT || "",
    launchEvent: process.env.LONG_LAUNCH_EVENT || "",
    claimableFn: process.env.LONG_CLAIMABLE_FN || "",
    claimFn: process.env.LONG_CLAIM_FN || "",
    tokenUriFn: process.env.LONG_TOKEN_URI_FN || "",
    fromBlock: BigInt(process.env.LONG_FROM_BLOCK || "0"),
    feeAssetDecimals: num("LONG_FEE_ASSET_DECIMALS", 18),
    feeAssetUsd: num("LONG_FEE_ASSET_USD", 1),
  },
};
