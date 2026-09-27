// Client for stonkfun.xyz's public Developer API (https://www.stonkfun.xyz/developers). No API key.
//
//   GET /pairs?launchable=true              quote assets a launch can pair against
//   GET /launchlab/pricing?quoteMint=…      the numbers that go in LaunchLab's create instruction
//   GET /tokens/{mint}                      a token stonkfun has picked up (adopted)
//
// stonkfun's own launch endpoint is off; launches are built on Raydium LaunchLab (lib/launchlab.ts) and stonkfun
// adopts them. Response shapes are read loosely and stonkfun's error messages are passed through unchanged.

import type { PricingHints } from "./launchlab.ts";

export type Pair = { mint: string; symbol: string; name: string; logo: string | null; category: string | null };

type Fetch = typeof fetch;

export class StonkfunError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** First value under one of `keys`, searching nested objects breadth-first. */
export function findValue(v: unknown, keys: string[]): unknown {
  const queue: unknown[] = [v];
  while (queue.length) {
    const cur = queue.shift();
    if (!isObj(cur)) continue;
    for (const k of keys) if (cur[k] !== undefined && cur[k] !== null && cur[k] !== "") return cur[k];
    for (const val of Object.values(cur)) if (isObj(val)) queue.push(val);
  }
  return undefined;
}

export function findString(v: unknown, keys: string[]): string | null {
  const queue: unknown[] = [v];
  while (queue.length) {
    const cur = queue.shift();
    if (!isObj(cur)) continue;
    for (const k of keys) if (typeof cur[k] === "string" && cur[k]) return cur[k] as string;
    for (const val of Object.values(cur)) if (isObj(val)) queue.push(val);
  }
  return null;
}

function list(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isObj(v)) for (const k of ["pairs", "data", "items", "results", "tokens"]) if (Array.isArray(v[k])) return v[k] as unknown[];
  return [];
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export class StonkfunClient {
  private base: string;
  private fetchImpl: Fetch;

  constructor(base = "https://www.stonkfun.xyz/api/public/v1", fetchImpl: Fetch = fetch) {
    this.base = base.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
  }

  private async call(path: string): Promise<unknown> {
    const res = await this.fetchImpl(this.base + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      const msg = (isObj(body) && findString(body, ["message", "error", "detail", "reason"])) || text.slice(0, 300) || res.statusText;
      throw new StonkfunError(`stonkfun ${res.status}: ${msg}`, res.status, body);
    }
    return body;
  }

  async pairs(): Promise<Pair[]> {
    const out: Pair[] = [];
    for (const p of list(await this.call("/pairs?launchable=true"))) {
      if (!isObj(p)) continue;
      const mint = findString(p, ["quoteMint", "mint", "address"]);
      const symbol = findString(p, ["symbol", "ticker"]);
      if (!mint || !symbol || !BASE58.test(mint)) continue;
      out.push({
        mint,
        symbol,
        name: findString(p, ["name"]) ?? symbol,
        logo: findString(p, ["logo", "logoURI", "logoUri", "image", "icon"]),
        category: findString(p, ["category", "type", "kind"]),
      });
    }
    return out;
  }

  /** stonkfun's suggested curve numbers for a pair; empty when it has none. */
  async pricing(quoteMint: string): Promise<PricingHints> {
    const raw = await this.call(`/launchlab/pricing?quoteMint=${encodeURIComponent(quoteMint)}`);
    const num = (keys: string[]): bigint | undefined => {
      const v = findValue(raw, keys);
      if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return BigInt(v);
      if (typeof v === "string" && /^\d+$/.test(v) && v !== "0") return BigInt(v);
      return undefined;
    };
    const out: PricingHints = {};
    const supply = num(["supply", "supplyInit", "totalSupply"]);
    const totalSellA = num(["totalSellA", "sellA", "totalSell"]);
    const raise = num(["totalFundRaisingB", "totalFundRaising", "raise", "fundRaising"]);
    if (supply) out.supply = supply;
    if (totalSellA) out.totalSellA = totalSellA;
    if (raise) out.totalFundRaisingB = raise;
    const configId = findString(raw, ["configId", "globalConfig"]);
    if (configId && BASE58.test(configId)) out.configId = configId;
    return out;
  }

  /** True once stonkfun lists the token (adopted from LaunchLab). */
  async listed(mint: string): Promise<boolean> {
    try {
      await this.call(`/tokens/${encodeURIComponent(mint)}`);
      return true;
    } catch (e) {
      if (e instanceof StonkfunError && e.status === 404) return false;
      throw e;
    }
  }
}
