import { NextResponse } from "next/server";
import { listTokens } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const sort = p.get("sort") === "new" ? "new" : "fees";
  const limit = Number(p.get("limit") ?? 50) || 50;
  return NextResponse.json(await listTokens((await db()), { sort, limit, q: p.get("q") ?? undefined }));
}
