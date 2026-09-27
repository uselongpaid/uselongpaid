import { parseMilestones } from "./milestones.ts";
import { chain } from "./chain.ts";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

export const config = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "LongPaid",
  chain,
  databasePath: process.env.DATABASE_PATH || "./data/longpaid.db",
  cronSecret: process.env.CRON_SECRET || "",
  recipientShareBps: num("RECIPIENT_SHARE_BPS", 8000),
  milestones: parseMilestones(process.env.PAYOUT_MILESTONES_USD, process.env.PAYOUT_MILESTONE_STEP_USD),
  feeSource: (process.env.FEE_SOURCE || "manual") as "manual" | "longxyz",
  /** xmoney (default): sent by hand from LongPaid's X Money balance to each @handle. erc20: automatic to a linked wallet. */
  payoutProvider: (process.env.PAYOUT_PROVIDER || "xmoney") as "xmoney" | "manual" | "webhook" | "erc20",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  explorerTxUrl: process.env.EXPLORER_TX_URL || `${chain.explorerUrl}/tx/{hash}`,
  /** A wallet-link request must be signed within this window. */
  linkMaxAgeMs: 60 * 60_000,
  erc20: {
    rpcUrl: process.env.PAYOUT_RPC_URL || process.env.LONG_RPC_URL || chain.rpcUrl,
    chainId: num("PAYOUT_CHAIN_ID", num("LONG_CHAIN_ID", chain.id)),
    token: process.env.PAYOUT_TOKEN_ADDRESS || "",
    decimals: num("PAYOUT_TOKEN_DECIMALS", 6),
    privateKey: process.env.PAYOUT_PRIVATE_KEY || "",
  },
  payoutWebhookUrl: process.env.PAYOUT_WEBHOOK_URL || "",
  payoutWebhookSecret: process.env.PAYOUT_WEBHOOK_SECRET || "",
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET || "",
  /** Where tokens are launched. Only shapes links and copy; claims are recorded by hand in /admin. */
  launchpad: {
    name: process.env.LAUNCHPAD_NAME || "stonkfun.xyz",
    url: (process.env.LAUNCHPAD_URL || "https://www.stonkfun.xyz").replace(/\/$/, ""),
    launchUrl: process.env.LAUNCHPAD_LAUNCH_URL || "https://www.stonkfun.xyz/launch",
    network: process.env.NEXT_PUBLIC_CHAIN_NAME || "Solana",
  },
  /** Solana wallet that receives the creator fees of LongPaid tokens. Shown on /launch when set. */
  feeWallet: process.env.LONGPAID_FEE_WALLET || "",
  /** Solana JSON-RPC used to confirm claim transactions and read token names. */
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  /** Launching on stonkfun.xyz from this site: the user's own wallet signs; the server only relays to stonkfun's API. */
  launch: {
    enabled: process.env.LAUNCH_ON_SITE !== "0",
    apiBase: process.env.STONKFUN_API_URL || "https://www.stonkfun.xyz/api/public/v1",
  },
  explorerTokenUrl: process.env.EXPLORER_TOKEN_URL || `${chain.explorerUrl}/token/{address}`,
  /** Optional: scanning long.xyz (Robinhood Chain) launches. Off unless LONGPAID_FEE_WALLETS is set. */
  detect: {
    factory: process.env.LONG_FACTORY_ADDRESS || "0x1Eef016F22A943abC7DD11422EDeE9D235942104",
    /** LongPaid's X account: what creators type as fee receiver on app.long.xyz. */
    handle: (process.env.LONGPAID_X_HANDLE || "uselongpaid").replace(/^@/, "").toLowerCase(),
    /** Wallet(s) long.xyz pays LongPaid's fees to (the long.xyz wallet of that X account). */
    feeWallets: (process.env.LONGPAID_FEE_WALLETS || "")
      .split(",")
      .map((w) => w.trim())
      .filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w)),
    startBlock: process.env.LONG_FACTORY_START_BLOCK ? BigInt(process.env.LONG_FACTORY_START_BLOCK) : undefined,
    /** Background scan interval inside the web process; 0 turns it off (use the cron route instead). */
    intervalMs: num("LONG_SYNC_INTERVAL_MS", 120_000),
  },
  long: {
    rpcUrl: process.env.LONG_RPC_URL || chain.rpcUrl,
    chainId: num("LONG_CHAIN_ID", chain.id),
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
