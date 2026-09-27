import { NextResponse } from "next/server";
import { isSolanaAddress } from "@/lib/address.ts";
import { getMarket } from "@/lib/marketData.ts";

export const dynamic = "force-dynamic";

/** Live market numbers and chart for a Solana coin (DEX Screener → GeckoTerminal → stonkfun). */
export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!isSolanaAddress(mint)) return NextResponse.json({ error: "not a Solana mint" }, { status: 400 });
  return NextResponse.json(await getMarket(mint), { headers: { "cache-control": "no-store" } });
}
