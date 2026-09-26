import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";
import type { FeeSource, Inspection } from "./types.ts";

const ERC20 = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]);

/**
 * Fees are claimed by the dev by hand and recorded in /admin, so there is nothing to discover or claim here.
 * With an RPC URL, `inspect` still reads the token's name and symbol from chain for the checker.
 */
export class ManualFeeSource implements FeeSource {
  private pub;

  constructor(rpcUrl: string) {
    this.pub = rpcUrl ? createPublicClient({ transport: http(rpcUrl) }) : null;
  }

  async discoverTokens() {
    return { tokens: [], cursor: null };
  }

  async claim(): Promise<{ amountMicros: number; txHash: string | null }> {
    throw new Error("claims are recorded by hand in /admin");
  }

  async inspect(tokenAddress: string): Promise<Inspection> {
    if (!this.pub) return { exists: null, name: null, symbol: null, handle: null, routesToTreasury: null, pendingMicros: null };
    const address = getAddress(tokenAddress) as Address;
    const [name, symbol] = await Promise.all([
      this.pub.readContract({ address, abi: ERC20, functionName: "name" }).catch(() => null),
      this.pub.readContract({ address, abi: ERC20, functionName: "symbol" }).catch(() => null),
    ]);
    return {
      exists: name !== null || symbol !== null,
      name: name === null ? null : String(name),
      symbol: symbol === null ? null : String(symbol),
      handle: null,
      routesToTreasury: null,
      pendingMicros: null,
    };
  }

  /** Reads name and symbol for a token being registered. */
  async tokenInfo(tokenAddress: string): Promise<{ name: string; symbol: string } | null> {
    const i = await this.inspect(tokenAddress);
    return i.name && i.symbol ? { name: i.name, symbol: i.symbol } : null;
  }

  /** True when the transaction exists and succeeded (only checked when an RPC URL is set). */
  async txSucceeded(hash: string): Promise<boolean | null> {
    if (!this.pub) return null;
    try {
      const r = await this.pub.getTransactionReceipt({ hash: hash as `0x${string}` });
      return r.status === "success";
    } catch {
      return false;
    }
  }
}
