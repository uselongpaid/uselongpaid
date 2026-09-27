"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Market } from "@/lib/marketData.ts";
import { CopyButton } from "./CopyButton.tsx";
import { LiveMarket, MarketPrice, useMarket } from "./LiveMarket.tsx";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Coin page for a coin that wasn't launched here (LongPaid's own coin, or any coin with market data). */
export function ExternalCoin({
  mint,
  market,
  official,
  fallbackSymbol,
  explorerUrl,
  buyUrl,
  buyLabel,
  network,
  appName,
}: {
  mint: string;
  market: Market | null;
  official: boolean;
  fallbackSymbol: string;
  explorerUrl: string;
  buyUrl: string;
  buyLabel: string;
  network: string;
  appName: string;
}) {
  const m = useMarket(mint, market);
  const symbol = m?.symbol ?? fallbackSymbol;
  // The page URL is only known in the browser; set it after hydration so server and client render the same.
  const [pageUrl, setPageUrl] = useState("");
  useEffect(() => setPageUrl(window.location.href), []);
  const share = `https://x.com/intent/tweet?text=${encodeURIComponent(`$${symbol || "coin"}${official ? ` · the ${appName} coin` : ""}`)}${
    pageUrl ? `&url=${encodeURIComponent(pageUrl)}` : ""
  }`;

  return (
    <div className="coin">
      <div className="coin-hero">
        {m?.image ? <img src={m.image} alt="" className="coin-logo" /> : <div className="coin-logo coin-logo-empty">{(symbol || "?")[0]}</div>}
        <div className="coin-title">
          <div className="coin-badges">
            <span className="pill">{network}</span>
            {official && <span className="pill paid">official {appName} coin</span>}
          </div>
          <h1>
            {m?.name ?? (symbol ? symbol : "Coin")} {symbol ? <span className="muted">${symbol}</span> : null}
          </h1>
          <div className="copy-row coin-mint">
            <code>{mint}</code>
            <CopyButton text={mint} />
          </div>
        </div>
        <MarketPrice m={m} />
      </div>

      <div className="coin-actions">
        <a className="btn" href={buyUrl} target="_blank" rel="noreferrer">
          {buyLabel}
        </a>
        {m?.pairUrl && (
          <a className="btn btn-ghost" href={m.pairUrl} target="_blank" rel="noreferrer">
            Full chart
          </a>
        )}
        <a className="btn btn-ghost" href={`${explorerUrl}/token/${mint}`} target="_blank" rel="noreferrer">
          Explorer
        </a>
        <a className="btn btn-ghost" href={share} target="_blank" rel="noreferrer">
          Share
        </a>
      </div>

      <LiveMarket m={m} title={`$${symbol || "coin"} live chart`} />

      <section>
        <h2>Details</h2>
        <dl className="coin-details">
          <dt>Contract</dt>
          <dd>
            <a className="mono" href={`${explorerUrl}/token/${mint}`} target="_blank" rel="noreferrer">
              {short(mint)}
            </a>
          </dd>
          {m?.pool && (
            <>
              <dt>Pool</dt>
              <dd>
                <a className="mono" href={`${explorerUrl}/address/${m.pool}`} target="_blank" rel="noreferrer">
                  {short(m.pool)}
                </a>
              </dd>
            </>
          )}
        </dl>
      </section>

      <p className="muted" style={{ fontSize: 13 }}>
        <Link href="/">Home</Link> · <Link href="/launch">Launch your own</Link>
      </p>
    </div>
  );
}
