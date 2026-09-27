import { createPublicClient, getAddress, http, parseAbi, type Address } from "viem";
import type { FeeSource, Inspection } from "./types.ts";
import { isEvmAddress, isSolanaAddress } from "../address.ts";

const ERC20 = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)"]);

const UNKNOWN: Inspection = { exists: null, name: null, symbol: null, handle: null, routesToTreasury: null, pendingMicros: null };

/**
 * Fees are claimed by the dev by hand and recorded in /admin, so there is nothing to discover or claim here.
 * Solana mints and transactions are checked over `solanaRpcUrl`; EVM ones over `rpcUrl` (name and symbol too).
 */
export class ManualFeeSource implements FeeSource {
  private pub;

  constructor(
    rpcUrl: string,
    private solanaRpcUrl = "",
  ) {
    this.pub = rpcUrl ? createPublicClient({ transport: http(rpcUrl) }) : null;
  }

  private async solana<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.solanaRpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(body.error.message);
    return body.result as T;
  }

  async discoverTokens() {
    return { tokens: [], cursor: null };
  }

  async claim(): Promise<{ amountMicros: number; txHash: string | null }> {
    throw new Error("claims are recorded by hand in /admin");
  }

  async inspect(tokenAddress: string): Promise<Inspection> {
    if (isSolanaAddress(tokenAddress)) {
      if (!this.solanaRpcUrl) return UNKNOWN;
      // Confirms the mint exists; names live in Metaplex metadata, which the admin enters by hand.
      const acct = await this.solana<{ value: { owner: string } | null }>("getAccountInfo", [tokenAddress, { encoding: "base64" }]).catch(
        () => undefined,
      );
      return { ...UNKNOWN, exists: acct === undefined ? null : acct.value !== null };
    }
    if (!this.pub || !isEvmAddress(tokenAddress)) return UNKNOWN;
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
    if (!hash.startsWith("0x")) {
      if (!this.solanaRpcUrl) return null;
      try {
        const r = await this.solana<{ value: ({ err: unknown } | null)[] }>("getSignatureStatuses", [
          [hash],
          { searchTransactionHistory: true },
        ]);
        const status = r.value[0];
        return status ? status.err === null : false;
      } catch {
        return null;
      }
    }
    if (!this.pub) return null;
    try {
      const r = await this.pub.getTransactionReceipt({ hash: hash as `0x${string}` });
      return r.status === "success";
    } catch {
      return false;
    }
  }
}
