import Link from "next/link";
import { config } from "@/lib/config.ts";
import { db } from "@/lib/server.ts";
import { listCoins, pendingCoins } from "@/lib/coins.ts";
import { launcher } from "@/lib/launch-api.ts";
import { CoinCard } from "@/components/CoinCard.tsx";
import { marketWithin } from "@/lib/marketData.ts";
import { fmtUsd } from "@/lib/market.ts";

export const dynamic = "force-dynamic";

export default async function Coins({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const d = db();
  // Launches whose page was closed before they confirmed: settle them so they show up here.
  if (config.launch.enabled) await Promise.all(pendingCoins(d, 20_000).map((r) => launcher().refresh(r.id).catch(() => null)));
  const coins = listCoins(d, { q: q || undefined, limit: 90 });
  const project = config.projectCoin.mint;
  const pm = project && !q ? await marketWithin(project) : null;
  const pSymbol = pm?.symbol ?? config.projectCoin.symbol;
  return (
    <>
      <div className="coins-head">
        <div>
          <h1>Coins</h1>
          <p className="muted">
            Every coin launched on {config.appName}, live on {config.launchpad.name}.
          </p>
        </div>
        <Link className="btn" href="/launch">
          Launch a coin
        </Link>
      </div>
      <form className="lookup" action="/coins" method="get" style={{ marginBottom: 24 }}>
        <input name="q" defaultValue={q} placeholder="Search name, ticker, @handle or mint" aria-label="Search coins" />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      {project && !q && (
        <Link href={`/coin/${project}`} className="coin-card coin-card-featured">
          {pm?.image ? <img src={pm.image} alt="" className="coin-card-logo" /> : <div className="coin-card-logo coin-logo-empty" style={{ fontSize: 26 }}>L</div>}
          <div className="coin-card-body">
            <div className="coin-card-title">
              <span className="pill paid" style={{ marginRight: 8 }}>
                official
              </span>
              <strong>{pSymbol ? `$${pSymbol}` : `${config.appName} coin`}</strong> {pm?.name && <span className="muted">{pm.name}</span>}
            </div>
            <div className="coin-card-meta muted mono">{project}</div>
            <div className="coin-card-meta">
              {pm?.priceUsd !== null && pm?.priceUsd !== undefined && <span>{fmtUsd(pm.priceUsd, false)}</span>}
              {pm?.marketCapUsd !== null && pm?.marketCapUsd !== undefined && <span className="muted">mcap {fmtUsd(pm.marketCapUsd)}</span>}
              <span className="muted">live chart →</span>
            </div>
          </div>
        </Link>
      )}

      {coins.length ? (
        <div className="coin-grid">
          {coins.map((c) => (
            <CoinCard key={c.id} c={c} />
          ))}
        </div>
      ) : (
        <div className="empty">{q ? `No coins match "${q}".` : <>No coins yet. <Link href="/launch">Launch the first one.</Link></>}</div>
      )}
    </>
  );
}
