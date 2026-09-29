import { NextResponse } from "next/server";
import { settlePayout } from "@/lib/ledger.ts";
import { listPayouts, type PayoutRow } from "@/lib/queries.ts";
import { authorized, db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = new URL(req.url).searchParams.get("status");
  const status = s === "queued" || s === "paid" || s === "failed" ? (s as PayoutRow["status"]) : undefined;
  return NextResponse.json(await listPayouts((await db()), { status, limit: 500 }));
}

/** Marks a queued payout as sent ({ok: true, ref}) or failed ({ok: false, reason}). */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: number; ok?: boolean; ref?: string; reason?: string } | null;
  if (!body || !Number.isInteger(body.id) || typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "expected {id, ok, ref|reason}" }, { status: 400 });
  }
  try {
    await settlePayout((await db()), body.id!, body.ok ? { ok: true, ref: body.ref ?? "" } : { ok: false, reason: body.reason ?? "failed" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
