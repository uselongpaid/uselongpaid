import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth.ts";
import { jsonError, launcher, publicLaunch, rateLimited } from "@/lib/launch-api.ts";
import type { LaunchForm } from "@/lib/launcher.ts";

export const dynamic = "force-dynamic";

/** Has stonkfun prepare a launch for the user's wallet; returns the unsigned payment transaction to sign. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (rateLimited(req)) return NextResponse.json({ error: "Too many launches from here. Wait a minute." }, { status: 429 });
  try {
    const { row, transaction } = await launcher().prepare((await req.json()) as LaunchForm);
    return NextResponse.json({ ...publicLaunch(row), transaction });
  } catch (e) {
    return jsonError(e);
  }
}
