import { createPublicClient, createWalletClient, defineChain, getAddress, http, isAddress, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { PayoutProvider, PayoutRequest, PayoutResult, SendHooks } from "./types.ts";

export type Erc20PayoutConfig = {
  rpcUrl: string;
  chainId: number;
  /** Stablecoin contract (for example USDC). */
  token: string;
  decimals: number;
  privateKey: string;
  explorerTxUrl?: string;
};

const ERC20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

/** Micro-dollars (6 decimals) to token base units, assuming 1 token = $1. */
export function microsToUnits(micros: number, decimals: number): bigint {
  if (!Number.isInteger(micros) || micros < 0) throw new Error("amount must be a non-negative integer");
  const m = BigInt(micros);
  return decimals >= 6 ? m * 10n ** BigInt(decimals - 6) : m / 10n ** BigInt(6 - decimals);
}

/**
 * Pays out automatically by sending a dollar stablecoin to the wallet the account owner linked.
 * Accounts without a wallet stay queued (send returns null) and are paid as soon as one is linked.
 * Not retry-safe: once a transfer may have been broadcast, the payout is held for an admin to check.
 */
export class Erc20PayoutProvider implements PayoutProvider {
  readonly name = "erc20";
  readonly retrySafe = false;
  private cfg: Erc20PayoutConfig;
  private pub;
  private wallet;

  constructor(cfg: Erc20PayoutConfig) {
    for (const k of ["rpcUrl", "token", "privateKey"] as const) {
      if (!cfg[k]) throw new Error(`erc20 payouts: missing ${k}`);
    }
    if (!cfg.chainId) throw new Error("erc20 payouts: missing chainId");
    if (!isAddress(cfg.token)) throw new Error("erc20 payouts: token is not an address");
    this.cfg = cfg;
    const chain = defineChain({
      id: cfg.chainId,
      name: "payout chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl] } },
    });
    this.pub = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
    this.wallet = createWalletClient({ chain, account: privateKeyToAccount(cfg.privateKey as `0x${string}`), transport: http(cfg.rpcUrl) });
  }

  get address(): Address {
    return this.wallet.account.address;
  }

  /** Stablecoin balance of the payout wallet, in micro-dollars. */
  async balanceMicros(): Promise<number> {
    const units = await this.pub.readContract({ address: this.cfg.token as Address, abi: ERC20, functionName: "balanceOf", args: [this.address] });
    const d = this.cfg.decimals;
    return Number(d >= 6 ? units / 10n ** BigInt(d - 6) : units * 10n ** BigInt(6 - d));
  }

  async send(p: PayoutRequest, hooks: SendHooks = {}): Promise<PayoutResult | null> {
    if (!p.wallet) return null;
    if (!isAddress(p.wallet)) return { ok: false, reason: "linked wallet is not a valid address" };
    const amount = microsToUnits(p.amountMicros, this.cfg.decimals);
    if (amount === 0n) return { ok: false, reason: "amount rounds to zero" };

    // Simulate first: a revert here (e.g. not enough balance) means nothing was sent, so it's safe to retry later.
    const { request } = await this.pub
      .simulateContract({
        address: this.cfg.token as Address,
        abi: ERC20,
        functionName: "transfer",
        args: [getAddress(p.wallet), amount],
        account: this.wallet.account,
      })
      .catch((e: Error) => {
        throw Object.assign(new Error(`transfer would fail: ${e.message.split("\n")[0]}`), { notSent: true });
      });
    const hash = await this.wallet.writeContract(request);
    hooks.onBroadcast?.(hash);
    const receipt = await this.pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") return { ok: false, reason: `transfer reverted: ${hash}` };
    return { ok: true, ref: hash };
  }
}
