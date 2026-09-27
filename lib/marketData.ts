import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { LAUNCHPAD_PROGRAM, getPdaLaunchpadPoolId } from "@raydium-io/raydium-sdk-v2";
import { config } from "./config.ts";
import { db } from "./server.ts";
import { coinStats } from "./market.ts";
import { StonkfunClient } from "./stonkfun.ts";

// Live market numbers and a chart for any Solana coin, from whichever source has it:
//   1. DEX Screener (graduated pools and most DEX pairs)
//   2. GeckoTerminal (also indexes Raydium LaunchLab bonding curves)
//   3. stonkfun's own token stats
// When no source knows a pool yet, the coin's LaunchLab pool is found on chain so GeckoTerminal can chart it.

export type Market = {
  mint: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  priceUsd: number | null;
  change24h: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holders: number | null;
  progress: number | null;
  pool: string | null;
  source: "dexscreener" | "geckoterminal" | "stonkfun" | null;
  /** Live chart to embed, or null when no pool is known yet. */
  chartUrl: string | null;
  /** Where to see more about the pair. */
  pairUrl: string | null;
  updatedAt: number;
};

const DS_API = (process.env.DEXSCREENER_API_URL || "https://api.dexscreener.com").replace(/\/$/, "");
const GT_API = (process.env.GECKOTERMINAL_API_URL || "https://api.geckoterminal.com/api/v2").replace(/\/$/, "");

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

export const dexScreenerEmbed = (pair: string) =>
  `https://dexscreener.com/solana/${pair}?embed=1&loadChartSettings=0&theme=dark&trades=0&info=0&chartLeftToolbar=0&chartTheme=dark&chartStyle=1&chartType=usd&interval=5`;
export const geckoEmbed = (pool: string) =>
  `https://www.geckoterminal.com/solana/pools/${pool}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0&chart_type=price&resolution=5m`;

type DsPair = {
  chainId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  txns?: { h24?: { buys: number; sells: number } };
  info?: { imageUrl?: string };
};

async function fromDexScreener(mint: string): Promise<Partial<Market> | null> {
  const d = (await getJson(`${DS_API}/latest/dex/tokens/${mint}`)) as { pairs?: DsPair[] | null };
  const p = (d.pairs ?? []).filter((x) => x.chainId === "solana" && x.baseToken.address === mint).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (!p) return null;
  return {
    name: p.baseToken.name,
    symbol: p.baseToken.symbol,
    image: p.info?.imageUrl ?? null,
    priceUsd: num(p.priceUsd),
    change24h: num(p.priceChange?.h24),
    marketCapUsd: num(p.marketCap ?? p.fdv),
    volume24hUsd: num(p.volume?.h24),
    liquidityUsd: num(p.liquidity?.usd),
    buys24h: num(p.txns?.h24?.buys),
    sells24h: num(p.txns?.h24?.sells),
    pool: p.pairAddress,
    source: "dexscreener",
    chartUrl: dexScreenerEmbed(p.pairAddress),
    pairUrl: p.url,
  };
}

type GtPool = {
  attributes: {
    address: string;
    base_token_price_usd?: string;
    fdv_usd?: string;
    market_cap_usd?: string | null;
    price_change_percentage?: { h24?: string };
    transactions?: { h24?: { buys: number; sells: number } };
    volume_usd?: { h24?: string };
    reserve_in_usd?: string;
  };
  relationships?: { base_token?: { data?: { id?: string } } };
};

async function fromGecko(mint: string): Promise<Partial<Market> | null> {
  const [pools, token] = await Promise.all([
    getJson(`${GT_API}/networks/solana/tokens/${mint}/pools?page=1`) as Promise<{ data?: GtPool[] }>,
    (getJson(`${GT_API}/networks/solana/tokens/${mint}`) as Promise<{ data?: { attributes?: Record<string, unknown> } }>).catch(() => null),
  ]);
  const t = token?.data?.attributes ?? {};
  const p = (pools.data ?? [])
    .filter((x) => !x.relationships?.base_token?.data?.id || x.relationships.base_token.data.id === `solana_${mint}`)
    .sort((a, b) => (num(b.attributes.reserve_in_usd) ?? 0) - (num(a.attributes.reserve_in_usd) ?? 0))[0];
  if (!p && !t.symbol) return null;
  const a = p?.attributes;
  return {
    name: (t.name as string) ?? null,
    symbol: (t.symbol as string) ?? null,
    image: typeof t.image_url === "string" && t.image_url !== "missing.png" ? (t.image_url as string) : null,
    priceUsd: num(a?.base_token_price_usd ?? t.price_usd),
    change24h: num(a?.price_change_percentage?.h24),
    marketCapUsd: num(a?.market_cap_usd ?? t.market_cap_usd ?? a?.fdv_usd ?? t.fdv_usd),
    volume24hUsd: num(a?.volume_usd?.h24),
    liquidityUsd: num(a?.reserve_in_usd ?? t.total_reserve_in_usd),
    buys24h: num(a?.transactions?.h24?.buys),
    sells24h: num(a?.transactions?.h24?.sells),
    pool: a?.address ?? null,
    source: "geckoterminal",
    chartUrl: a?.address ? geckoEmbed(a.address) : null,
    pairUrl: a?.address ? `https://www.geckoterminal.com/solana/pools/${a.address}` : null,
  };
}

const WSOL = "So11111111111111111111111111111111111111112";
const poolCache = new Map<string, string | null>();

/** The coin's Raydium LaunchLab pool: from our own launches, else derived for each launchable quote and checked on chain. */
async function launchLabPool(mint: string): Promise<string | null> {
  if (poolCache.has(mint)) return poolCache.get(mint)!;
  const row = db().prepare("SELECT pool FROM site_launches WHERE mint = ? AND pool IS NOT NULL").get(mint) as { pool: string } | undefined;
  let found: string | null = row?.pool ?? null;
  if (!found) {
    const quotes = new Set([WSOL]);
    try {
      for (const p of await new StonkfunClient(config.launch.apiBase).pairs()) quotes.add(p.mint);
    } catch {}
    const base = new PublicKey(mint);
    const ids = [...quotes].map((q) => getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, base, new PublicKey(q)).publicKey);
    const conn = new Connection(config.solanaRpcUrl, "confirmed");
    for (let i = 0; i < ids.length && !found; i += 100) {
      const accs = await conn.getMultipleAccountsInfo(ids.slice(i, i + 100)).catch(() => []);
      const hit = accs.findIndex((a) => a?.owner.equals(LAUNCHPAD_PROGRAM));
      if (hit >= 0) found = ids[i + hit].toBase58();
    }
  }
  poolCache.set(mint, found);
  if (poolCache.size > 5000) poolCache.clear();
  return found;
}

const cache = new Map<string, { at: number; m: Market }>();

/** Market numbers and chart for a coin, cached for 8 seconds. Never throws. */
export async function getMarket(mint: string): Promise<Market> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 8000) return hit.m;

  const m: Market = {
    mint,
    name: null,
    symbol: null,
    image: null,
    priceUsd: null,
    change24h: null,
    marketCapUsd: null,
    volume24hUsd: null,
    liquidityUsd: null,
    buys24h: null,
    sells24h: null,
    holders: null,
    progress: null,
    pool: null,
    source: null,
    chartUrl: null,
    pairUrl: null,
    updatedAt: Date.now(),
  };
  const fill = (src: Partial<Market> | null) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src) as [keyof Market, unknown][]) {
      if (v !== null && v !== undefined && (m[k] === null || m[k] === undefined)) (m as Record<string, unknown>)[k] = v;
    }
  };

  const [ds, gt, sf] = await Promise.all([
    fromDexScreener(mint).catch(() => null),
    fromGecko(mint).catch(() => null),
    coinStats(mint).catch(() => null),
  ]);
  fill(ds);
  fill(gt);
  if (sf) {
    fill({
      priceUsd: sf.priceUsd,
      marketCapUsd: sf.marketCapUsd,
      volume24hUsd: sf.volume24hUsd,
      holders: sf.holders,
      progress: sf.progress,
      source: m.source ?? "stonkfun",
    });
  }
  if (!m.chartUrl) {
    const pool = await launchLabPool(mint).catch(() => null);
    if (pool) {
      m.pool ??= pool;
      m.chartUrl = geckoEmbed(pool);
      m.pairUrl ??= `https://www.geckoterminal.com/solana/pools/${pool}`;
    }
  }
  cache.set(mint, { at: Date.now(), m });
  if (cache.size > 2000) cache.clear();
  return m;
}

/** getMarket, but gives up after `ms` so a slow source never holds up a page; the browser fills in the rest. */
export function marketWithin(mint: string, ms = 3000): Promise<Market | null> {
  return Promise.race([getMarket(mint), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
