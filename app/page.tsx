import Link from "next/link";
import { config } from "@/lib/config.ts";
import { formatUsd } from "@/lib/money.ts";
import { dailyFees, getStats, listTokens, recentClaims } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";
import { ClaimsTable, TokensTable } from "@/components/Tables.tsx";
import { Lookup } from "@/components/Lookup.tsx";
import { LiveStats } from "@/components/LiveStats.tsx";
import { FeesChart } from "@/components/FeesChart.tsx";

export const dynamic = "force-dynamic";

export default function Home() {
  const d = db();
  const stats = getStats(d);
  const share = config.recipientShareBps / 100;

  return (
    <>
      <div className="hero">
        <h1>
          Send long.xyz token fees to <span className="hl">any X account.</span>
        </h1>
        <p className="lede">
          Launch a token on long.xyz with {config.appName} as its fee beneficiary and name an X handle. We claim the creator fees
          on-chain and pay {share}% of them out to that account in dollars. The other {100 - share}% buys back and burns.
        </p>
        <Lookup />
        <div className="hero-actions">
          <Link href="/launch">Launch a token →</Link>
          <Link href="/check">Check a token →</Link>
        </div>
      </div>

      <LiveStats initial={stats} />

      <section>
        <h2>Fees claimed, last 14 days</h2>
        <FeesChart data={dailyFees(d, 14)} />
      </section>

      <section>
        <h2>How it works</h2>
        <div className="steps">
          <div className="step">
            <div className="n">01</div>
            <h3>Launch on long.xyz</h3>
            <p>
              Set the creator-fee beneficiary to the {config.appName} treasury and put an X handle in the token metadata.{" "}
              <Link href="/launch">Launch guide.</Link>
            </p>
          </div>
          <div className="step">
            <div className="n">02</div>
            <h3>We claim the fees</h3>
            <p>The team claims creator fees on-chain regularly. Every claim is published with its transaction and credited to that X account.</p>
          </div>
          <div className="step">
            <div className="n">03</div>
            <h3>Paid in dollars</h3>
            <p>
              The first payout goes out at {formatUsd(config.milestones.list[0])} earned, then at every milestone after that.
              Each one sends the full balance automatically.
              {config.payoutProvider === "erc20" ? (
                <>
                  {" "}
                  <Link href="/wallet">Connect a wallet</Link> and link your X account to receive it.
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          <div className="split" aria-hidden>
            <div className="a" style={{ width: `${share}%` }} />
            <div className="b" style={{ width: `${100 - share}%` }} />
          </div>
          <div className="legend">
            <span>
              <i style={{ background: "var(--accent)" }} />
              {share}% to the X account
            </span>
            <span>
              <i style={{ background: "var(--burn)" }} />
              {100 - share}% buyback and burn
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2>Recent claims</h2>
        <ClaimsTable rows={recentClaims(d, { limit: 10 })} />
      </section>

      <section>
        <h2>Top tokens</h2>
        <TokensTable rows={listTokens(d, { limit: 10 })} />
      </section>
    </>
  );
}
