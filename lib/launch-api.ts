import "server-only";
import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { config } from "./config.ts";
import { db } from "./server.ts";
import { isHttps, requestHost } from "./http.ts";
import { LaunchError, Launcher, type LaunchRow } from "./launcher.ts";
import { buildLaunch } from "./launchlab.ts";
import { StonkfunClient, StonkfunError } from "./stonkfun.ts";

const g = globalThis as unknown as { __launcher?: Launcher };

export function launcher(): Launcher {
  if (!config.launch.enabled) throw new LaunchError("Launching from this site is turned off.");
  if (!g.__launcher) {
    const conn = new Connection(config.solanaRpcUrl, "confirmed");
    const sf = new StonkfunClient(config.launch.apiBase);
    g.__launcher = new Launcher({
      db: db(),
      build: (a) => buildLaunch(conn, a),
      pricing: (m) => sf.pricing(m),
      listed: (m) => sf.listed(m),
      send: (raw) => conn.sendRawTransaction(raw, { maxRetries: 5 }),
      status: async (sig) => {
        const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
        if (st?.err) return "failed";
        return st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") ? "confirmed" : "pending";
      },
    });
  }
  return g.__launcher;
}

/** The public origin of this request (the browser's host behind Railway's proxy). */
export function publicOrigin(req: Request): string {
  const host = requestHost(req);
  if (!host) return config.appUrl;
  return `${isHttps(req) ? "https" : "http"}://${host}`;
}

/** What the browser sees of a launch. */
export function publicLaunch(r: LaunchRow) {
  return {
    id: r.id,
    status: r.status,
    wallet: r.wallet,
    handle: r.handle,
    name: r.name,
    symbol: r.symbol,
    mint: r.mint,
    signature: r.signature,
    listed: Boolean(r.listed),
    error: r.error,
  };
}

export function jsonError(e: unknown) {
  if (e instanceof LaunchError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof StonkfunError) return NextResponse.json({ error: e.message }, { status: 502 });
  console.error("[launch]", e);
  return NextResponse.json({ error: (e as Error).message || "Something went wrong." }, { status: 500 });
}

const hits = new Map<string, number[]>();

/** Small per-IP limiter for building launches. */
export function rateLimited(req: Request, max = 12, windowMs = 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
