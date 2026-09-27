import Link from "next/link";
import { config } from "@/lib/config.ts";
import { db } from "@/lib/server.ts";
import { listCoins, pendingCoins } from "@/lib/coins.ts";
import { launcher } from "@/lib/launch-api.ts";
import { CoinCard } from "@/components/CoinCard.tsx";

export const dynamic = "force-dynamic";

export default async function Coins({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const d = db();
  // Launches whose page was closed before they confirmed: settle them so they show up here.
  if (config.launch.enabled) await Promise.all(pendingCoins(d, 20_000).map((r) => launcher().refresh(r.id).catch(() => null)));
  const coins = listCoins(d, { q: q || undefined, limit: 90 });
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
