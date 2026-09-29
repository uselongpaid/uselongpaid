import Link from "next/link";
import type { Metadata } from "next";
import { config } from "@/lib/config.ts";
import { marketWithin } from "@/lib/marketData.ts";
import { ExternalCoin } from "@/components/ExternalCoin.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const a = "";
  const m = a ? await marketWithin(a, 2000) : null;
  const sym = m?.symbol ?? config.projectCoin.symbol;
  return {
    title: a ? `${sym ? `$${sym}` : config.appName} · CA ${a}` : `${config.appName} · CA coming soon`,
    description: `The official ${config.appName} coin: contract address, live price and chart.`,
    openGraph: m?.image ? { images: [m.image] } : undefined,
  };
}

/** uselongpaid.xyz/ca: the official coin's CA, live numbers and chart. */
export default async function Ca() {
  // Coin section is off until the relaunch: always show "coming soon", whatever PROJECT_COIN_ADDRESS says.
  const a = "";
  if (!a) {
    return (
      <div className="docs" style={{ textAlign: "center", padding: "80px 0" }}>
        <div className="eyebrow" style={{ justifyContent: "center" }}>
          <span className="dot" /> {config.appName} coin
        </div>
        <h1>CA coming soon</h1>
        <p className="muted">
          The official contract address will be posted here and on{" "}
          {config.detect.handle ? (
            <a href={`https://x.com/${config.detect.handle}`} target="_blank" rel="noreferrer">
              @{config.detect.handle}
            </a>
          ) : (
            "X"
          )}
          . Don&apos;t trust a CA from anywhere else.
        </p>
        <p>
          <Link href="/">Back to {config.appName}</Link>
        </p>
      </div>
    );
  }
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
