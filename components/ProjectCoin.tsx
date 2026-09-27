"use client";

import { useEffect, useState } from "react";

// LongPaid's own coin: contract address to copy, live market numbers and a real-time chart. Numbers come from
// DEX Screener's public API (refreshed every 10 seconds in the browser); the chart is DEX Screener's live embed.

type Pair = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  txns?: { h24?: { buys: number; sells: number } };
  info?: { imageUrl?: string };
};

const usd = (n: number | undefined | null, compact = true) =>
  n === undefined || n === null
    ? "—"
    : n > 0 && n < 0.01
      ? `$${n.toPrecision(3)}`
      : n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: compact && n >= 10_000 ? "compact" : "standard", maximumFractionDigits: n < 1 ? 6 : 2 });

export function ProjectCoin({ mint, fallbackSymbol, tradeUrl, explorerUrl }: { mint: string; fallbackSymbol: string; tradeUrl: string; explorerUrl: string }) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { cache: "no-store" });
        const d = (await r.json()) as { pairs?: Pair[] | null };
        // The most liquid Solana pair where this coin is the base token.
        const best = (d.pairs ?? [])
          .filter((p) => p.chainId === "solana" && p.baseToken.address === mint)
          .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        if (!stop) {
          setPair((prev) => best ?? prev);
          setUpdated(Date.now());
        }
      } catch {
        // Keep the last numbers; the next tick tries again.
      } finally {
        if (!stop) setLoaded(true);
      }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [mint]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  const symbol = pair?.baseToken.symbol ?? fallbackSymbol;
  const change = pair?.priceChange?.h24;
  const chartSrc = pair ? `https://dexscreener.com/solana/${pair.pairAddress}?embed=1&loadChartSettings=0&theme=dark&trades=0&info=0&chartLeftToolbar=0&chartTheme=dark&chartStyle=1&chartType=usd&interval=5` : null;

  return (
    <section id="coin" className="project-coin">
      <div className="project-coin-head">
        <div className="project-coin-title">
          {pair?.info?.imageUrl ? <img src={pair.info.imageUrl} alt="" className="project-coin-logo" /> : null}
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              <span className="dot" /> Our coin{updated ? " · live" : ""}
            </div>
            <h2 style={{ margin: 0 }}>
              {symbol ? `$${symbol}` : "The LongPaid coin"} {pair?.baseToken.name ? <span className="muted" style={{ fontWeight: 400 }}>{pair.baseToken.name}</span> : null}
            </h2>
          </div>
        </div>
        <div className="project-coin-price">
          <div className="project-coin-big">{usd(pair?.priceUsd ? Number(pair.priceUsd) : null, false)}</div>
          {change !== undefined && <div className={change >= 0 ? "up" : "down"}>{`${change >= 0 ? "+" : ""}${change.toFixed(2)}% 24h`}</div>}
        </div>
      </div>

      <div className="copy-row project-coin-ca">
        <span className="copy-label">CA</span>
        <code>{mint}</code>
        <button type="button" className="btn btn-small" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">Market cap</div>
          <div className="value">{usd(pair?.marketCap ?? pair?.fdv)}</div>
        </div>
        <div className="stat">
          <div className="label">24h volume</div>
          <div className="value">{usd(pair?.volume?.h24)}</div>
        </div>
        <div className="stat">
          <div className="label">Liquidity</div>
          <div className="value">{usd(pair?.liquidity?.usd)}</div>
        </div>
        <div className="stat">
          <div className="label">24h trades</div>
          <div className="value">{pair?.txns?.h24 ? (pair.txns.h24.buys + pair.txns.h24.sells).toLocaleString("en-US") : "—"}</div>
          {pair?.txns?.h24 && (
            <div className="sub">
              {pair.txns.h24.buys.toLocaleString("en-US")} buys · {pair.txns.h24.sells.toLocaleString("en-US")} sells
            </div>
          )}
        </div>
      </div>

      <div className="coin-chart">
        {chartSrc ? (
          <iframe title={`$${symbol} live chart`} src={chartSrc} />
        ) : (
          <div className="project-coin-empty muted">{loaded ? "The live chart appears here once the coin has trades on a DEX." : "Loading the live chart…"}</div>
        )}
      </div>

      <div className="coin-actions" style={{ marginTop: 16 }}>
        <a className="btn" href={`https://jup.ag/swap/SOL-${mint}`} target="_blank" rel="noreferrer">
          Buy on Jupiter
        </a>
        <a className="btn btn-ghost" href={tradeUrl} target="_blank" rel="noreferrer">
          stonkfun.xyz
        </a>
        <a className="btn btn-ghost" href={pair?.url ?? `https://dexscreener.com/solana/${mint}`} target="_blank" rel="noreferrer">
          DEX Screener
        </a>
        <a className="btn btn-ghost" href={`${explorerUrl}/token/${mint}`} target="_blank" rel="noreferrer">
          Explorer
        </a>
      </div>
    </section>
  );
}
