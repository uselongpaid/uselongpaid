import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth.ts";
import { jsonError, launcher, publicLaunch } from "@/lib/launch-api.ts";

export const dynamic = "force-dynamic";

/** Sends the wallet-signed launch to Solana. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  try {
    const b = (await req.json()) as { id?: string; signedTransaction?: string };
    if (!b.id || !b.signedTransaction) return NextResponse.json({ error: "Missing launch id or signed transaction." }, { status: 400 });
    return NextResponse.json(publicLaunch(await launcher().submit(b.id, b.signedTransaction)));
  } catch (e) {
    return jsonError(e);
  }
}
