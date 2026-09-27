import { NextResponse } from "next/server";
import { getMarket } from "@/lib/marketData.ts";

export const dynamic = "force-dynamic";

/** Live market numbers and chart for a token (DEX Screener → GeckoTerminal → the token contract). */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "not a token address" }, { status: 400 });
  return NextResponse.json(await getMarket(address.toLowerCase()), { headers: { "cache-control": "no-store" } });
}
