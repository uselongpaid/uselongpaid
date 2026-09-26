import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { accountsForWallet, listLinkRequests, listPayouts } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

/** What a wallet receives: linked X accounts, their payouts, and pending link requests. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return NextResponse.json({ error: "invalid address" }, { status: 400 });
  const d = db();
  const accounts = accountsForWallet(d, address);
  return NextResponse.json({
    accounts: accounts.map((a) => ({
      handle: a.handle,
      lifetimeMicros: a.lifetime_micros,
      paidMicros: a.paid_micros,
      balanceMicros: a.balance_micros,
      queuedMicros: listPayouts(d, { handle: a.handle, status: "queued" }).reduce((s, p) => s + p.amount_micros, 0),
      optedOut: Boolean(a.opted_out),
    })),
    requests: listLinkRequests(d, { wallet: address, limit: 20 }).map((r) => ({
      id: r.id,
      handle: r.handle,
      code: r.code,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
}
