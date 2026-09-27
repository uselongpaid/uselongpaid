// Launching a stonkfun.xyz coin from this site. stonkfun's own launch endpoint is off, so the launch is built on
// Raydium LaunchLab under StonkFun's platform config and stonkfun adopts it within a minute or two.
//
// The user's wallet pays, signs and is the creator, so its creator fees go to that wallet. The server builds the
// transaction (signed only by the throwaway mint key), relays the wallet-signed copy to Solana, and serves the
// token's metadata. It never holds a user key or funds.
//
// building → prepared → submitted → completed (then `listed` once stonkfun has adopted it)
//                                  ↘ failed

import { randomUUID } from "node:crypto";
import { PublicKey, type VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { type Db } from "./db.ts";
import { normalizeHandle } from "./handle.ts";
import { isSolanaAddress } from "./address.ts";
import { decodeTx, messageBytes, signedBy } from "./solana/tx.ts";
import type { BuiltLaunch, PricingHints } from "./launchlab.ts";

export type LaunchRow = {
  id: string;
  wallet: string;
  handle: string | null;
  name: string;
  symbol: string;
  description: string;
  image: string;
  socials: string;
  quote_mint: string;
  mint: string | null;
  pool: string | null;
  tx: string | null;
  status: "building" | "prepared" | "submitted" | "completed" | "failed";
  signature: string | null;
  listed: number;
  error: string | null;
  created_at: number;
  updated_at: number;
};

export type BuildArgs = { wallet: PublicKey; quoteMint: PublicKey; name: string; symbol: string; uri: string; hints: PricingHints };

export interface LaunchDeps {
  db: Db;
  build(args: BuildArgs): Promise<BuiltLaunch>;
  pricing(quoteMint: string): Promise<PricingHints>;
  listed(mint: string): Promise<boolean>;
  send(raw: Uint8Array): Promise<string>;
  status(signature: string): Promise<"confirmed" | "failed" | "pending">;
  now?: () => number;
}

export class LaunchError extends Error {}

export type LaunchForm = {
  wallet: string;
  handle?: string;
  name: string;
  symbol: string;
  description?: string;
  image: string;
  quoteMint: string;
  twitter?: string;
  website?: string;
  telegram?: string;
};

export type LaunchFields = {
  handle: string | null;
  name: string;
  symbol: string;
  description: string;
  image: string;
  quoteMint: string;
  socials: { twitter?: string; website?: string; telegram?: string };
};

const URL_RE = /^https:\/\/[^\s]{3,300}$/;
/** The blockhash in a built transaction is only good for about this long. */
const PREPARED_TTL_MS = 90_000;

/** Validates the form. With a handle, the description ends with "fees @handle". */
export function launchFields(f: LaunchForm): LaunchFields {
  let handle: string | null = null;
  if ((f.handle ?? "").trim()) {
    handle = normalizeHandle(f.handle!);
    if (!handle) throw new LaunchError("That X handle isn't valid.");
  }
  const name = (f.name ?? "").trim();
  if (name.length < 1 || name.length > 32) throw new LaunchError("Name must be 1–32 characters.");
  const symbol = (f.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw new LaunchError("Ticker must be 1–10 letters or digits.");
  const image = (f.image ?? "").trim();
  if (!URL_RE.test(image) && !/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    throw new LaunchError("Add a logo (PNG, JPG, GIF or WEBP) or an https:// image link.");
  }
  if (image.length > 1_500_000) throw new LaunchError("Logo is too large; keep it under 1 MB.");
  if (!isSolanaAddress(f.quoteMint ?? "")) throw new LaunchError("Pick what the coin trades against.");
  let bio = (f.description ?? "").trim();
  if (handle) bio = bio.replace(/\s*fees?\s*(?:to|send)?\s*:?\s*@\w+\s*$/i, "");
  if (bio.length > 400) throw new LaunchError("Description must be under 400 characters.");
  const description = handle ? `${bio ? `${bio}\n\n` : ""}fees @${handle}` : bio;
  const socials: LaunchFields["socials"] = {};
  for (const k of ["twitter", "website", "telegram"] as const) {
    const v = (f[k] ?? "").trim();
    if (!v) continue;
    if (!URL_RE.test(v)) throw new LaunchError(`${k[0].toUpperCase() + k.slice(1)} must be an https:// link.`);
    socials[k] = v;
  }
  return { handle, name, symbol, description, image, quoteMint: f.quoteMint, socials };
}

/** The token metadata JSON that the mint's URI points at. */
export function metadataJson(r: LaunchRow, imageUrl: string) {
  const socials = JSON.parse(r.socials) as LaunchFields["socials"];
  return {
    name: r.name,
    symbol: r.symbol,
    description: r.description,
    image: imageUrl,
    ...(socials.twitter ? { twitter: socials.twitter } : {}),
    ...(socials.website ? { website: socials.website } : {}),
    ...(socials.telegram ? { telegram: socials.telegram } : {}),
  };
}

const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export class Launcher {
  private d: LaunchDeps;
  private now: () => number;

  constructor(deps: LaunchDeps) {
    this.d = deps;
    this.now = deps.now ?? Date.now;
  }

  get(id: string): LaunchRow | null {
    return (this.d.db.prepare("SELECT * FROM site_launches WHERE id = ?").get(id) as LaunchRow | undefined) ?? null;
  }

  private set(id: string, fields: Partial<LaunchRow>, whereStatus?: LaunchRow["status"]): boolean {
    const keys = Object.keys(fields);
    const sql = `UPDATE site_launches SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?${whereStatus ? " AND status = ?" : ""}`;
    const args = [...keys.map((k) => (fields as Record<string, unknown>)[k] as string | number | null), this.now(), id];
    if (whereStatus) args.push(whereStatus);
    return Number(this.d.db.prepare(sql).run(...args).changes) === 1;
  }

  /**
   * Builds the launch transaction for the user's wallet. `metadataUrl(id)` is where this site will serve the token's
   * metadata. Returns the transaction for the wallet to sign.
   */
  async prepare(form: LaunchForm, metadataUrl: (id: string) => string): Promise<{ row: LaunchRow; transaction: string }> {
    if (!isSolanaAddress(form.wallet ?? "")) throw new LaunchError("Connect a Solana wallet first.");
    const wallet = new PublicKey(form.wallet);
    const f = launchFields(form);
    const id = randomUUID();
    const t = this.now();
    this.d.db
      .prepare(
        `INSERT INTO site_launches (id, wallet, handle, name, symbol, description, image, socials, quote_mint, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'building', ?, ?)`,
      )
      .run(id, wallet.toBase58(), f.handle, f.name, f.symbol, f.description, f.image, JSON.stringify(f.socials), f.quoteMint, t, t);

    let built: BuiltLaunch;
    try {
      const hints = await this.d.pricing(f.quoteMint).catch(() => ({}) as PricingHints);
      built = await this.d.build({ wallet, quoteMint: new PublicKey(f.quoteMint), name: f.name, symbol: f.symbol, uri: metadataUrl(id), hints });
    } catch (e) {
      this.set(id, { status: "failed", error: (e as Error).message });
      throw new LaunchError((e as Error).message);
    }
    const transaction = Buffer.from(built.tx.serialize()).toString("base64");
    this.set(id, { status: "prepared", mint: built.mint.toBase58(), pool: built.pool.toBase58(), tx: transaction }, "building");
    return { row: this.get(id)!, transaction };
  }

  /** Relays the wallet-signed launch to Solana: only the exact transaction that was built, signed by that wallet. */
  async submit(id: string, signedTransaction: string): Promise<LaunchRow> {
    const row = this.get(id);
    if (!row) throw new LaunchError("Launch not found.");
    if (row.status !== "prepared" || !row.tx) return row;
    if (this.now() - row.created_at > PREPARED_TTL_MS) {
      this.set(id, { status: "failed", error: "The signature came too late and the transaction expired. Nothing was charged; try again." }, "prepared");
      return this.get(id)!;
    }
    let signed: VersionedTransaction;
    try {
      const tx = decodeTx(signedTransaction);
      if (!("version" in tx)) throw new Error();
      signed = tx;
    } catch {
      throw new LaunchError("That isn't the launch transaction.");
    }
    const built = decodeTx(row.tx) as VersionedTransaction;
    if (!bytesEqual(messageBytes(signed), messageBytes(built))) throw new LaunchError("The signed transaction isn't the one that was built.");
    if (!signedBy(signed, new PublicKey(row.wallet))) throw new LaunchError("The wallet didn't sign the launch.");
    if (!signedBy(signed, new PublicKey(row.mint!))) throw new LaunchError("The mint signature is missing; start again.");

    const sig = bs58.encode(signed.signatures[0]);
    try {
      if (!this.set(id, { status: "submitted", signature: sig, error: null }, "prepared")) return this.get(id)!;
    } catch {
      throw new LaunchError("That launch was already sent.");
    }
    try {
      await this.d.send(signed.serialize());
    } catch (e) {
      this.set(id, { status: "failed", error: `Solana rejected the launch: ${(e as Error).message}` }, "submitted");
    }
    return this.get(id)!;
  }

  /** Moves a sent launch forward: confirmed on Solana, then listed on stonkfun. */
  async refresh(id: string): Promise<LaunchRow | null> {
    const row = this.get(id);
    if (!row) return null;
    if (row.status === "submitted" && row.signature) {
      const st = await this.d.status(row.signature).catch(() => "pending" as const);
      if (st === "confirmed") this.set(id, { status: "completed" }, "submitted");
      else if (st === "failed") this.set(id, { status: "failed", error: "The launch transaction failed on Solana. Only the network fee was spent." }, "submitted");
      else if (this.now() - row.updated_at > 3 * 60_000) this.set(id, { status: "failed", error: "The launch didn't land on Solana. Check your wallet before trying again." }, "submitted");
    }
    const cur = this.get(id)!;
    if (cur.status === "completed" && !cur.listed && cur.mint && (await this.d.listed(cur.mint).catch(() => false))) this.set(id, { listed: 1 });
    return this.get(id);
  }

  recent(limit = 30): LaunchRow[] {
    return this.d.db.prepare("SELECT * FROM site_launches WHERE status IN ('submitted','completed') ORDER BY created_at DESC LIMIT ?").all(limit) as LaunchRow[];
  }
}
