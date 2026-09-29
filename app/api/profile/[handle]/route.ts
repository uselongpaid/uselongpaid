import { NextResponse } from "next/server";
import { normalizeHandle } from "@/lib/handle.ts";
import { getAccount, listPayouts, listTokens, recentClaims } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const handle = normalizeHandle(decodeURIComponent((await params).handle));
  if (!handle) return NextResponse.json({ error: "invalid handle" }, { status: 400 });
  const d = await db();
  return NextResponse.json({
    handle,
    account: await getAccount(d, handle),
    tokens: await listTokens(d, { handle, limit: 200 }),
    payouts: await listPayouts(d, { handle, limit: 50 }),
    claims: await recentClaims(d, { handle, limit: 50 }),
  });
}
