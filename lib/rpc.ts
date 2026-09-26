import { fallback, http, type Transport } from "viem";
import { chain } from "./chain.ts";

/**
 * Configured RPC URLs (comma-separated, a private provider first) followed by the chain's public endpoint.
 * Robinhood Chain's public RPC sits behind Cloudflare and sometimes answers servers with 403, so one URL isn't enough.
 */
export function rpcUrls(rpcUrl: string): string[] {
  const own = rpcUrl.split(",").map((u) => u.trim()).filter(Boolean);
  return [...new Set([...own, chain.rpcUrl])];
}

export function rpcTransport(rpcUrl: string): Transport {
  const urls = rpcUrls(rpcUrl);
  const one = (url: string) => http(url, { retryCount: 2, retryDelay: 1000, timeout: 20_000 });
  return urls.length === 1 ? one(urls[0]) : fallback(urls.map(one), { rank: false, retryCount: 1 });
}
