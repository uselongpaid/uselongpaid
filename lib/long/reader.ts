import { createPublicClient, defineChain, getAddress, type Address, type Hex } from "viem";
import { rpcTransport } from "../rpc.ts";
import { chain } from "../chain.ts";
import type { TokenMetadata } from "../handle.ts";
import { FACTORY_ABI, metadataUrls, type LaunchedToken } from "./factory.ts";
import type { LaunchReader, MetadataFetcher } from "./sync.ts";

const LAUNCH_METADATA = FACTORY_ABI[0];

/** Reads long.xyz's factory over JSON-RPC. */
export class ViemLaunchReader implements LaunchReader {
  private readonly pub;
  private readonly factory: Address;
  private readonly times = new Map<bigint, number>();

  constructor(rpcUrl: string, factory: string) {
    this.factory = getAddress(factory);
    const c = defineChain({ id: chain.id, name: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: { default: { http: [chain.rpcUrl] } } });
    this.pub = createPublicClient({ chain: c, transport: rpcTransport(rpcUrl) });
  }

  head() {
    return this.pub.getBlockNumber();
  }

  async launches(from: bigint, to: bigint): Promise<LaunchedToken[]> {
    const logs = await this.pub.getLogs({ address: this.factory, event: LAUNCH_METADATA, fromBlock: from, toBlock: to, strict: true });
    return logs.map((l) => ({
      asset: getAddress(l.args.asset),
      launcher: getAddress(l.args.launcher),
      name: l.args.details.name,
      symbol: l.args.details.symbol,
      tokenURI: l.args.details.tokenURI,
      numeraire: getAddress(l.args.details.numeraire),
      txHash: l.transactionHash as Hex,
      blockNumber: l.blockNumber as bigint,
    }));
  }

  async launchInput(txHash: Hex): Promise<Hex> {
    return (await this.pub.getTransaction({ hash: txHash })).input;
  }

  async blockTime(block: bigint): Promise<number> {
    const hit = this.times.get(block);
    if (hit) return hit;
    const ms = Number((await this.pub.getBlock({ blockNumber: block })).timestamp) * 1000;
    this.times.set(block, ms);
    return ms;
  }
}

/** Fetches a token's metadata JSON (ipfs:// through public gateways, or https). Null if unreachable. */
export const fetchMetadata: MetadataFetcher = async (tokenURI) => {
  const inline = tokenURI.trim();
  if (inline.startsWith("data:application/json")) {
    const body = inline.slice(inline.indexOf(",") + 1);
    return JSON.parse(inline.includes(";base64,") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body)) as TokenMetadata;
  }
  for (const url of metadataUrls(inline)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
      if (res.ok) return (await res.json()) as TokenMetadata;
    } catch {
      // try the next gateway
    }
  }
  return null;
};
