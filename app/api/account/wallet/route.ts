import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { config } from "@/lib/config.ts";
import { currentSession, sameOrigin } from "@/lib/auth.ts";
import { setWallet } from "@/lib/ledger.ts";
import { distributePending } from "@/lib/distribute.ts";
import { db, payoutProvider } from "@/lib/server.ts";

/** Signed-in owners link the wallet their payouts go to; anything waiting is sent right away. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const raw = String((await req.formData()).get("wallet") ?? "").trim();
  if (raw && !isAddress(raw)) return NextResponse.redirect(`${config.appUrl}/account?error=wallet`, 303);

  const d = db();
  setWallet(d, session.handle, raw ? getAddress(raw) : null);
  let sent = 0;
  if (raw) {
    try {
      sent = (await distributePending(d, payoutProvider(), { handle: session.handle })).sent.length;
    } catch {
      sent = 0; // stays queued; the distribute cron retries
    }
  }
  return NextResponse.redirect(`${config.appUrl}/account?saved=${sent ? `sent-${sent}` : "1"}`, 303);
}
