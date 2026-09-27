"use client";

import { useState } from "react";
import Link from "next/link";
import type { Market } from "@/lib/marketData.ts";
import { LiveMarket, MarketPrice, useMarket } from "./LiveMarket.tsx";

// LongPaid's own coin on the home page: CA to copy, live numbers and a real-time chart.

export function ProjectCoin({
  address: mint,
  fallbackSymbol,
  initial,
  buyUrl,
  buyLabel,
  explorerUrl,
}: {
  address: string;
  fallbackSymbol: string;
  initial: Market | null;
  buyUrl: string;
  buyLabel: string;
  explorerUrl: string;
}) {
  const m = useMarket(mint, initial);
  const [copied, setCopied] = useState(false);
  const symbol = m?.symbol ?? fallbackSymbol;

  async function copy() {
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <section id="coin" className="project-coin">
      <div className="project-coin-head">
        <div className="project-coin-title">
          {m?.image ? <img src={m.image} alt="" className="project-coin-logo" /> : null}
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              <span className="dot" /> Our coin · live
            </div>
            <h2 style={{ margin: 0 }}>
              {symbol ? `$${symbol}` : "The LongPaid coin"} {m?.name ? <span className="muted" style={{ fontWeight: 400 }}>{m.name}</span> : null}
            </h2>
          </div>
        </div>
        <MarketPrice m={m} />
      </div>

      <div className="copy-row project-coin-ca">
        <span className="copy-label">CA</span>
        <code>{mint}</code>
        <button type="button" className="btn btn-small" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <LiveMarket m={m} title={`$${symbol || "coin"} live chart`} />

      <div className="coin-actions" style={{ marginTop: 16 }}>
        <a className="btn" href={buyUrl} target="_blank" rel="noreferrer">
          {buyLabel}
        </a>
        <Link className="btn btn-ghost" href={`/coin/${mint}`}>
          Coin page
        </Link>
        {m?.pairUrl && (
          <a className="btn btn-ghost" href={m.pairUrl} target="_blank" rel="noreferrer">
            Full chart
          </a>
        )}
        <a className="btn btn-ghost" href={`${explorerUrl}/token/${mint}`} target="_blank" rel="noreferrer">
          Explorer
        </a>
      </div>
    </section>
  );
}
