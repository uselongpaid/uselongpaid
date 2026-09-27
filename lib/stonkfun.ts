// Client for stonkfun.xyz's public Developer API (https://www.stonkfun.xyz/developers). No API key: a launch is
// authorised by the creator wallet's signature on the fee payment.
//
//   GET  /pairs?launchable=true          quote assets a launch can pair against
//   POST /launches/prepare               checks the launch, returns a signed quote + an unsigned payment transaction
//   POST /launches/submit                takes the signed payment back and lands the launch as one bundle
//   GET  /launches/{paymentSignature}    status until it's completed, with the new mint
//
// The request field names below follow the public docs as far as they could be read. Everything that depends on them
// lives in this file; stonkfun's own error message is passed through unchanged so a mismatch is obvious.

export type Pair = { mint: string; symbol: string; name: string; logo: string | null; category: string | null };

export type LaunchInput = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  quoteMint: string;
  twitter?: string;
  website?: string;
  telegram?: string;
};

export type Prepared = {
  /** base64 unsigned payment transaction, to be signed by the creator wallet. */
  transaction: string;
  /** Everything else stonkfun returned (the signed quote, ids), sent back on submit. */
  quote: unknown;
  raw: Record<string, unknown>;
};

export type LaunchStatus = { state: "processing" | "completed" | "failed"; mint: string | null; message: string | null; raw: unknown };

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

const TX_KEYS = ["transaction", "paymentTransaction", "unsignedTransaction", "tx", "serializedTransaction"];
const MINT_KEYS = ["mint", "tokenMint", "baseMint", "mintAddress", "tokenAddress"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** First string under one of `keys`, searching nested objects breadth-first. */
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

export class StonkfunClient {
  private base: string;
  private fetchImpl: Fetch;

  constructor(base = "https://www.stonkfun.xyz/api/public/v1", fetchImpl: Fetch = fetch) {
    this.base = base.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
  }

  private async call(path: string, init?: RequestInit): Promise<unknown> {
    const res = await this.fetchImpl(this.base + path, {
      ...init,
      headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      const msg = (isObj(body) && (findString(body, ["message", "error", "detail", "reason"]) ?? null)) || text.slice(0, 300) || res.statusText;
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
      if (!mint || !symbol) continue;
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

  async prepare(wallet: string, input: LaunchInput, requestId: string): Promise<Prepared> {
    const body: Record<string, unknown> = {
      wallet,
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      image: input.image,
      quoteMint: input.quoteMint,
      requestId,
    };
    for (const k of ["twitter", "website", "telegram"] as const) if (input[k]) body[k] = input[k];
    const raw = await this.call("/launches/prepare", { method: "POST", body: JSON.stringify(body) });
    if (!isObj(raw)) throw new StonkfunError("stonkfun returned an unexpected prepare response", 502, raw);
    const transaction = findString(raw, TX_KEYS);
    if (!transaction) throw new StonkfunError("stonkfun's prepare response has no payment transaction", 502, raw);
    return { transaction, quote: raw.quote ?? raw.signedQuote ?? null, raw };
  }

  async submit(prepared: Prepared, signedTransaction: string): Promise<LaunchStatus> {
    const body: Record<string, unknown> = { signedTransaction };
    if (prepared.quote !== null) body.quote = prepared.quote;
    return this.status(await this.call("/launches/submit", { method: "POST", body: JSON.stringify(body) }));
  }

  async launch(paymentSignature: string): Promise<LaunchStatus> {
    return this.status(await this.call(`/launches/${encodeURIComponent(paymentSignature)}`));
  }

  private status(raw: unknown): LaunchStatus {
    const s = (findString(raw, ["status", "state"]) ?? "").toLowerCase();
    const mint = findString(raw, MINT_KEYS);
    const message = findString(raw, ["error", "message", "reason"]);
    const state = /fail|error|reject|expired|dropped/.test(s) ? "failed" : /complete|success|landed|done|live/.test(s) || (mint && !s) ? "completed" : "processing";
    return { state, mint: state === "completed" ? mint : null, message, raw };
  }
}
