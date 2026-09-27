import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { config } from "@/lib/config.ts";
import { marketWithin } from "@/lib/marketData.ts";
import { ExternalCoin } from "@/components/ExternalCoin.tsx";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ address: string }> };

const valid = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { address } = await params;
  const m = valid(address) ? await marketWithin(address.toLowerCase(), 2000) : null;
  return {
    title: m?.symbol ? `$${m.symbol}${m.name ? ` (${m.name})` : ""} · ${config.appName}` : `Coin · ${config.appName}`,
    openGraph: m?.image ? { images: [m.image] } : undefined,
  };
}

/** Live market page for LongPaid's own coin, or any token that has market data. */
export default async function Coin({ params }: Params) {
  const { address } = await params;
  if (!valid(address)) notFound();
  const a = address.toLowerCase();
  if (a === config.projectCoin.address) redirect("/ca");
  const official = false;
  const market = await marketWithin(a, 5000);
  if (!official && !market?.symbol && !market?.chartUrl) notFound();
  return (
    <ExternalCoin
      mint={a}
      market={market}
      official={official}
      fallbackSymbol={official ? config.projectCoin.symbol : ""}
      explorerUrl={config.chain.explorerUrl}
      buyUrl={official ? config.projectCoin.buyUrl : "https://app.long.xyz"}
      buyLabel="Buy on long.xyz"
      network={config.chain.name}
      appName={config.appName}
    />
  );
}
