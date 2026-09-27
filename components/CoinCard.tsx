import Link from "next/link";
import type { LaunchRow } from "@/lib/launcher.ts";
import { coinImage } from "@/lib/coins.ts";
import { timeAgo } from "@/components/Tables.tsx";

/** One coin in the launchpad grid. */
export function CoinCard({ c }: { c: LaunchRow }) {
  return (
    <Link href={`/coin/${c.mint}`} className="coin-card">
      <img src={coinImage(c)} alt="" className="coin-card-logo" loading="lazy" />
      <div className="coin-card-body">
        <div className="coin-card-title">
          <strong>{c.name}</strong> <span className="muted">${c.symbol}</span>
        </div>
        {c.handle && <div className="coin-card-fees mono">fees @{c.handle}</div>}
        <div className="coin-card-meta muted">
          {timeAgo(c.created_at)}
          {c.listed ? <span className="pill paid">listed</span> : null}
        </div>
      </div>
    </Link>
  );
}
