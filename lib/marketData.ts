import "server-only";
import { createPublicClient, erc20Abi, getAddress, type Address } from "viem";
import { config } from "./config.ts";
import { rpcTransport } from "./rpc.ts";

// Live market numbers and a chart for a token, from whichever source has it:
//   1. DEX Screener (any chain; picks the most liquid pair where the token is the base)
//   2. GeckoTerminal (searched by address, so the network doesn't need to be known up front)
// Name and symbol fall back to the token contract itself on the site's chain.

export type Market = {
  address: string;
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
  source: "dexscreener" | "geckoterminal" | "chain" | null;
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

export const dexScreenerEmbed = (chain: string, pair: string) =>
  `https://dexscreener.com/${chain}/${pair}?embed=1&loadChartSettings=0&theme=dark&trades=0&info=0&chartLeftToolbar=0&chartTheme=dark&chartStyle=1&chartType=usd&interval=5`;
export const geckoEmbed = (network: string, pool: string) =>
  `https://www.geckoterminal.com/${network}/pools/${pool}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0&chart_type=price&resolution=5m`;

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

async function fromDexScreener(address: string): Promise<Partial<Market> | null> {
  const d = (await getJson(`${DS_API}/latest/dex/tokens/${address}`)) as { pairs?: DsPair[] | null };
  const p = (d.pairs ?? [])
    .filter((x) => x.baseToken.address.toLowerCase() === address.toLowerCase())
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
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
    chartUrl: dexScreenerEmbed(p.chainId, p.pairAddress),
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
  relationships?: { base_token?: { data?: { id?: string } }; network?: { data?: { id?: string } } };
};

async function fromGecko(address: string): Promise<Partial<Market> | null> {
  const found = (await getJson(`${GT_API}/search/pools?query=${address}&page=1`)) as { data?: GtPool[] };
  const lower = address.toLowerCase();
  const p = (found.data ?? [])
    .filter((x) => (x.relationships?.base_token?.data?.id ?? "").toLowerCase().endsWith(`_${lower}`))
    .sort((a, b) => (num(b.attributes.reserve_in_usd) ?? 0) - (num(a.attributes.reserve_in_usd) ?? 0))[0];
  if (!p) return null;
  const network = p.relationships?.network?.data?.id ?? (p.relationships?.base_token?.data?.id ?? "").split("_")[0];
  const token = network
    ? ((await getJson(`${GT_API}/networks/${network}/tokens/${address}`).catch(() => null)) as { data?: { attributes?: Record<string, unknown> } } | null)
    : null;
  const t = token?.data?.attributes ?? {};
  const a = p.attributes;
  return {
    name: (t.name as string) ?? null,
    symbol: (t.symbol as string) ?? null,
    image: typeof t.image_url === "string" && t.image_url !== "missing.png" ? (t.image_url as string) : null,
    priceUsd: num(a.base_token_price_usd ?? t.price_usd),
    change24h: num(a.price_change_percentage?.h24),
    marketCapUsd: num(a.market_cap_usd ?? t.market_cap_usd ?? a.fdv_usd ?? t.fdv_usd),
    volume24hUsd: num(a.volume_usd?.h24),
    liquidityUsd: num(a.reserve_in_usd),
    buys24h: num(a.transactions?.h24?.buys),
    sells24h: num(a.transactions?.h24?.sells),
    pool: a.address,
    source: "geckoterminal",
    chartUrl: network ? geckoEmbed(network, a.address) : null,
    pairUrl: network ? `https://www.geckoterminal.com/${network}/pools/${a.address}` : null,
  };
}

const tokenInfoCache = new Map<string, { name: string | null; symbol: string | null }>();

/** Name and symbol straight from the token contract on the site's chain. */
async function fromChain(address: string): Promise<Partial<Market> | null> {
  let info = tokenInfoCache.get(address);
  if (!info) {
    const pub = createPublicClient({ transport: rpcTransport(config.long.rpcUrl) });
    const a = getAddress(address) as Address;
    const [name, symbol] = await Promise.all([
      pub.readContract({ address: a, abi: erc20Abi, functionName: "name" }).catch(() => null),
      pub.readContract({ address: a, abi: erc20Abi, functionName: "symbol" }).catch(() => null),
    ]);
    info = { name, symbol };
    if (name || symbol) tokenInfoCache.set(address, info);
  }
  return info.name || info.symbol ? { ...info, source: "chain" } : null;
}

const cache = new Map<string, { at: number; m: Market }>();

/** Market numbers and chart for a token, cached for 8 seconds. Never throws. */
export async function getMarket(address: string): Promise<Market> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 8000) return hit.m;

  const m: Market = {
    address,
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
  const [ds, gt] = await Promise.all([fromDexScreener(address).catch(() => null), fromGecko(address).catch(() => null)]);
  fill(ds);
  fill(gt);
  // Only ask the chain when neither source knows the token, and never wait long for it.
  if (!m.symbol) {
    fill(await Promise.race([fromChain(address).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3000))]));
  }
  cache.set(key, { at: Date.now(), m });
  if (cache.size > 2000) cache.clear();
  return m;
}

/** getMarket, but gives up after `ms` so a slow source never holds up a page; the browser fills in the rest. */
export function marketWithin(address: string, ms = 3000): Promise<Market | null> {
  return Promise.race([getMarket(address), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}
