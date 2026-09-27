"use client";

import type { Market } from "@/lib/marketData.ts";
import { LiveMarket, MarketPrice, useMarket } from "./LiveMarket.tsx";

/** Live price, numbers and chart on a coin page. */
export function CoinLive({ mint, initial, symbol }: { mint: string; initial: Market | null; symbol: string }) {
  const m = useMarket(mint, initial);
  return (
    <section className="coin-live">
      <div className="coin-live-head">
        <h2 style={{ margin: 0 }}>Live chart</h2>
        <MarketPrice m={m} />
      </div>
      <LiveMarket m={m} title={`$${symbol} live chart`} />
    </section>
  );
}
