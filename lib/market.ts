import "server-only";
import { config } from "./config.ts";
import { StonkfunClient, type TokenStats } from "./stonkfun.ts";

const cache = new Map<string, { at: number; stats: TokenStats | null }>();

/** stonkfun's market numbers for a coin, cached for 30 seconds. Null when unknown or stonkfun can't be reached. */
export async function coinStats(mint: string): Promise<TokenStats | null> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 30_000) return hit.stats;
  let stats: TokenStats | null = null;
  try {
    stats = await new StonkfunClient(config.launch.apiBase).token(mint);
  } catch {
    stats = hit?.stats ?? null;
  }
  cache.set(mint, { at: Date.now(), stats });
  if (cache.size > 2000) cache.clear();
  return stats;
}

export function fmtUsd(n: number | null, compact = true): string {
  if (n === null) return "—";
  if (n > 0 && n < 0.01) return `$${n.toPrecision(3)}`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: compact && n >= 10_000 ? "compact" : "standard", maximumFractionDigits: n < 1 ? 6 : 2 });
}
