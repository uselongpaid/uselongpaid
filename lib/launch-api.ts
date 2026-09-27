import "server-only";
import { NextResponse } from "next/server";
import { config } from "./config.ts";
import { db } from "./server.ts";
import { LaunchError, Launcher, type LaunchRow } from "./launcher.ts";
import { StonkfunClient, StonkfunError } from "./stonkfun.ts";

const g = globalThis as unknown as { __launcher?: Launcher };

export function launcher(): Launcher {
  if (!config.launch.enabled) throw new LaunchError("Launching from this site is turned off.");
  g.__launcher ??= new Launcher(db(), new StonkfunClient(config.launch.apiBase));
  return g.__launcher;
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
    costLamports: r.cost_lamports,
    launchSig: r.launch_sig,
    mint: r.mint,
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

/** Small per-IP limiter for the endpoints that call stonkfun. */
export function rateLimited(req: Request, max = 12, windowMs = 60_000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
