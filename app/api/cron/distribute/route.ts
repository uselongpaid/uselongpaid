import { NextResponse } from "next/server";
import { distributePending } from "@/lib/distribute.ts";
import { authorized, db, payoutProvider } from "@/lib/server.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Sends any queued payouts (e.g. accounts that linked a wallet since). Call from cron. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await distributePending(await db(), payoutProvider()));
}
