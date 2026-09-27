import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { config } from "@/lib/config.ts";
import { marketWithin } from "@/lib/marketData.ts";
import { ExternalCoin } from "@/components/ExternalCoin.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const a = config.projectCoin.address;
  const m = a ? await marketWithin(a, 2000) : null;
  const sym = m?.symbol ?? config.projectCoin.symbol;
  return {
    title: `${sym ? `$${sym}` : config.appName} · CA ${a}`,
    description: `The official ${config.appName} coin: contract address, live price and chart.`,
    openGraph: m?.image ? { images: [m.image] } : undefined,
  };
}

/** uselongpaid.xyz/ca: the official coin's CA, live numbers and chart. */
export default async function Ca() {
  const a = config.projectCoin.address;
  if (!a) notFound();
  return (
    <ExternalCoin
      mint={a}
      market={await marketWithin(a, 5000)}
      official
      fallbackSymbol={config.projectCoin.symbol}
      explorerUrl={config.chain.explorerUrl}
      buyUrl={config.projectCoin.buyUrl}
      buyLabel="Buy on long.xyz"
      network={config.chain.name}
      appName={config.appName}
    />
  );
}
