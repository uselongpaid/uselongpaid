// Launching on stonkfun.xyz from this site. The user's own wallet is the stonkfun creator: it signs and pays the
// launch fee itself, and its creator fees go to that wallet. The server never holds a key or funds; it relays the
// launch to stonkfun's API and remembers it so the page can show progress.
//
// prepared → submitted → completed
//          ↘ failed

import { randomUUID } from "node:crypto";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { type Db } from "./db.ts";
import { normalizeHandle } from "./handle.ts";
import { isSolanaAddress } from "./address.ts";
import { decodeTx, feePayer, lamportsOut, messageBytes, signedBy } from "./solana/tx.ts";
import { type LaunchInput, type LaunchStatus, type Prepared, StonkfunError } from "./stonkfun.ts";

export type LaunchRow = {
  id: string;
  wallet: string;
  handle: string | null;
  name: string;
  symbol: string;
  quote_mint: string;
  cost_lamports: number;
  prepared: string;
  status: "prepared" | "submitted" | "completed" | "failed";
  launch_sig: string | null;
  mint: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};

export interface Stonkfun {
  prepare(wallet: string, input: LaunchInput, requestId: string): Promise<Prepared>;
  submit(prepared: Prepared, signedTransaction: string): Promise<LaunchStatus>;
  launch(paymentSignature: string): Promise<LaunchStatus>;
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

const URL_RE = /^https:\/\/[^\s]{3,300}$/;
/** stonkfun's prepared transaction carries a live blockhash; it can't be submitted after this. */
const PREPARED_TTL_MS = 90_000;

/** Validates the form and turns it into what stonkfun receives. With a handle, the bio ends with "fees @handle". */
export function launchInput(f: LaunchForm): { handle: string | null; input: LaunchInput } {
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
  const input: LaunchInput = { name, symbol, description, image, quoteMint: f.quoteMint };
  for (const k of ["twitter", "website", "telegram"] as const) {
    const v = (f[k] ?? "").trim();
    if (!v) continue;
    if (!URL_RE.test(v)) throw new LaunchError(`${k[0].toUpperCase() + k.slice(1)} must be an https:// link.`);
    input[k] = v;
  }
  return { handle, input };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function paymentSignature(tx: VersionedTransaction | Transaction): string | null {
  const s = "version" in tx ? tx.signatures[0] : tx.signature;
  return s && s.some((b) => b !== 0) ? bs58.encode(s) : null;
}

export class Launcher {
  private db: Db;
  private stonkfun: Stonkfun;
  private now: () => number;

  constructor(db: Db, stonkfun: Stonkfun, now?: () => number) {
    this.db = db;
    this.stonkfun = stonkfun;
    this.now = now ?? Date.now;
  }

  get(id: string): LaunchRow | null {
    return (this.db.prepare("SELECT * FROM launch_requests WHERE id = ?").get(id) as LaunchRow | undefined) ?? null;
  }

  private set(id: string, fields: Partial<LaunchRow>, whereStatus?: LaunchRow["status"]): boolean {
    const keys = Object.keys(fields);
    const sql = `UPDATE launch_requests SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?${whereStatus ? " AND status = ?" : ""}`;
    const args = [...keys.map((k) => (fields as Record<string, unknown>)[k] as string | number | null), this.now(), id];
    if (whereStatus) args.push(whereStatus);
    return Number(this.db.prepare(sql).run(...args).changes) === 1;
  }

  /**
   * Asks stonkfun to prepare a launch for the user's wallet. Returns the unsigned payment transaction for the wallet
   * to sign, and what it will cost that wallet.
   */
  async prepare(form: LaunchForm): Promise<{ row: LaunchRow; transaction: string }> {
    if (!isSolanaAddress(form.wallet ?? "")) throw new LaunchError("Connect a Solana wallet first.");
    const wallet = new PublicKey(form.wallet);
    const { handle, input } = launchInput(form);
    const id = randomUUID();
    const prepared = await this.stonkfun.prepare(wallet.toBase58(), input, id);
    const tx = decodeTx(prepared.transaction);
    if (!feePayer(tx)?.equals(wallet)) throw new LaunchError("stonkfun prepared the launch for a different wallet.");
    const t = this.now();
    this.db
      .prepare(
        `INSERT INTO launch_requests (id, wallet, handle, name, symbol, quote_mint, cost_lamports, prepared, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?)`,
      )
      .run(id, wallet.toBase58(), handle, input.name, input.symbol, input.quoteMint, Number(lamportsOut(tx, wallet)), JSON.stringify(prepared), t, t);
    return { row: this.get(id)!, transaction: prepared.transaction };
  }

  /**
   * Relays the wallet-signed payment to stonkfun. Only the exact transaction that was prepared, signed by the wallet
   * it was prepared for, is accepted.
   */
  async submit(id: string, signedTransaction: string): Promise<LaunchRow> {
    const row = this.get(id);
    if (!row) throw new LaunchError("Launch not found.");
    if (row.status !== "prepared") return row;
    if (this.now() - row.created_at > PREPARED_TTL_MS) {
      this.set(id, { status: "failed", error: "The signature came too late; the prepared launch expired. Nothing was charged." }, "prepared");
      return this.get(id)!;
    }
    const prepared = JSON.parse(row.prepared) as Prepared;
    let signed: VersionedTransaction | Transaction;
    try {
      signed = decodeTx(signedTransaction);
    } catch {
      throw new LaunchError("That isn't a Solana transaction.");
    }
    if (!bytesEqual(messageBytes(signed), messageBytes(decodeTx(prepared.transaction)))) {
      throw new LaunchError("The signed transaction isn't the one that was prepared.");
    }
    if (!signedBy(signed, new PublicKey(row.wallet))) throw new LaunchError("The wallet didn't sign the launch.");
    const sig = paymentSignature(signed);
    try {
      if (!this.set(id, { status: "submitted", launch_sig: sig }, "prepared")) return this.get(id)!;
    } catch {
      throw new LaunchError("That signed launch was already submitted.");
    }
    try {
      return this.apply(id, await this.stonkfun.submit(prepared, signedTransaction));
    } catch (e) {
      if (e instanceof StonkfunError && e.status >= 400 && e.status < 500) {
        this.set(id, { status: "failed", error: `stonkfun rejected the launch: ${e.message}` });
      } else {
        // Unknown whether it landed; polling the payment signature settles it.
        this.set(id, { error: (e as Error).message });
      }
      return this.get(id)!;
    }
  }

  /** Polls stonkfun for a submitted launch. */
  async refresh(id: string): Promise<LaunchRow | null> {
    const row = this.get(id);
    if (!row || row.status !== "submitted" || !row.launch_sig) return row;
    try {
      return this.apply(id, await this.stonkfun.launch(row.launch_sig));
    } catch (e) {
      if (this.now() - row.updated_at > 15 * 60_000) this.set(id, { status: "failed", error: `No result from stonkfun: ${(e as Error).message}` });
      return this.get(id);
    }
  }

  private apply(id: string, st: LaunchStatus): LaunchRow {
    const row = this.get(id)!;
    if (st.state === "failed") {
      this.set(id, { status: "failed", error: `stonkfun: ${st.message ?? "launch failed"}` }, "submitted");
    } else if (st.state === "completed" && st.mint && isSolanaAddress(st.mint)) {
      this.set(id, { status: "completed", mint: st.mint, error: null }, "submitted");
    } else if (this.now() - row.updated_at > 15 * 60_000) {
      this.set(id, { status: "failed", error: "stonkfun didn't finish the launch in 15 minutes. Check your wallet." }, "submitted");
    }
    return this.get(id)!;
  }

  recent(limit = 30): LaunchRow[] {
    return this.db.prepare("SELECT * FROM launch_requests WHERE status != 'prepared' ORDER BY created_at DESC LIMIT ?").all(limit) as LaunchRow[];
  }
}
