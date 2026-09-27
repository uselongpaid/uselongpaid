import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth.ts";
import { jsonError, launcher, publicLaunch, publicOrigin, rateLimited } from "@/lib/launch-api.ts";
import type { LaunchForm } from "@/lib/launcher.ts";

export const dynamic = "force-dynamic";

/** Builds the LaunchLab launch for the user's wallet; returns the transaction for the wallet to sign. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (rateLimited(req)) return NextResponse.json({ error: "Too many launches from here. Wait a minute." }, { status: 429 });
  try {
    const origin = publicOrigin(req);
    const { row, transaction } = await launcher().prepare((await req.json()) as LaunchForm, (id) => `${origin}/api/launch/${id}/metadata`);
    return NextResponse.json({ ...publicLaunch(row), transaction });
  } catch (e) {
    return jsonError(e);
  }
}
