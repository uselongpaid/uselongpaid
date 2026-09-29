import { NextResponse } from "next/server";
import { normalizeHandle } from "@/lib/handle.ts";
import { setOptOut } from "@/lib/ledger.ts";
import { authorized, db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { handle?: string; optedOut?: boolean } | null;
  const handle = body?.handle ? normalizeHandle(body.handle) : null;
  if (!handle || typeof body?.optedOut !== "boolean") {
    return NextResponse.json({ error: "expected {handle, optedOut}" }, { status: 400 });
  }
  await setOptOut((await db()), handle, body.optedOut);
  return NextResponse.json({ handle, optedOut: body.optedOut });
}
