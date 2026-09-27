"use client";

import { useEffect, useState } from "react";
import type { Market } from "@/lib/marketData.ts";
import { fmtUsd, groupInt } from "@/lib/format.ts";

// Market numbers and a live chart for a coin; useMarket refreshes them every 10 seconds from /api/market/:mint.

export { fmtUsd } from "@/lib/format.ts";

export function useMarket(mint: string, initial: Market | null): Market | null {
  const [m, setM] = useState(initial);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/market/${mint}`, { cache: "no-store" });
        if (r.ok && !stop) setM(await r.json());
      } catch {}
    };
    if (!initial) tick();
    const id = setInterval(tick, 10_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [mint, initial]);
  return m;
}

export function MarketPrice({ m }: { m: Market | null }) {
  return (
    <div className="project-coin-price">
      <div className="project-coin-big">{fmtUsd(m?.priceUsd, false)}</div>
      {m?.change24h !== null && m?.change24h !== undefined && (
        <div className={m.change24h >= 0 ? "up" : "down"}>{`${m.change24h >= 0 ? "+" : ""}${m.change24h.toFixed(2)}% 24h`}</div>
      )}
    </div>
  );
}

/** Stats row, bonding-curve progress and the live chart for market data the parent keeps fresh (useMarket). */
export function LiveMarket({ m, title }: { m: Market | null; title?: string }) {
  // Keep the first chart URL so the iframe isn't reloaded on every refresh.
  const [chart, setChart] = useState<string | null>(m?.chartUrl ?? null);
  useEffect(() => {
    if (!chart && m?.chartUrl) setChart(m.chartUrl);
  }, [m?.chartUrl, chart]);
  const trades = m?.buys24h !== null && m?.buys24h !== undefined && m.sells24h !== null ? m.buys24h + m.sells24h : null;

  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="label">Market cap</div>
          <div className="value">{fmtUsd(m?.marketCapUsd)}</div>
        </div>
        <div className="stat">
          <div className="label">24h volume</div>
          <div className="value">{fmtUsd(m?.volume24hUsd)}</div>
        </div>
        <div className="stat">
          <div className="label">{m?.liquidityUsd !== null && m?.liquidityUsd !== undefined ? "Liquidity" : "Holders"}</div>
          <div className="value">
            {m?.liquidityUsd !== null && m?.liquidityUsd !== undefined ? fmtUsd(m.liquidityUsd) : (m?.holders !== null && m?.holders !== undefined ? groupInt(m.holders) : "—")}
          </div>
        </div>
        <div className="stat">
          <div className="label">24h trades</div>
          <div className="value">{trades !== null ? groupInt(trades) : "—"}</div>
          {trades !== null && (
            <div className="sub">
              {groupInt(m!.buys24h!)} buys · {groupInt(m!.sells24h!)} sells
            </div>
          )}
        </div>
      </div>

      {m?.progress !== null && m?.progress !== undefined && m.progress < 100 && (
        <div className="coin-progress" aria-label="Bonding curve progress">
          <div className="coin-progress-head">
            <span>Bonding curve</span>
            <span className="mono">{m.progress.toFixed(1)}%</span>
          </div>
          <div className="coin-progress-bar">
            <span style={{ width: `${m.progress}%` }} />
          </div>
        </div>
      )}

      <div className="coin-chart">
        {chart ? (
          <iframe title={title ?? "Live chart"} src={chart} allow="clipboard-write" />
        ) : (
          <div className="project-coin-empty muted">
            {m ? "No trading pool found for this coin yet. The live chart shows up as soon as it has one." : "Loading the live chart…"}
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Live data{m?.source ? ` from ${m.source === "dexscreener" ? "DEX Screener" : m.source === "geckoterminal" ? "GeckoTerminal" : "stonkfun.xyz"}` : ""}, updated every
        10 seconds.
        {m?.pairUrl && (
          <>
            {" "}
            <a href={m.pairUrl} target="_blank" rel="noreferrer">
              Open full chart
            </a>
          </>
        )}
      </p>
    </>
  );
}
