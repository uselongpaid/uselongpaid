import Link from "next/link";
import { config } from "@/lib/config.ts";
import { formatUsd } from "@/lib/money.ts";
import { dailyFees, getStats, listTokens, recentClaims } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";
import { ClaimsTable, TokensTable } from "@/components/Tables.tsx";
import { Lookup } from "@/components/Lookup.tsx";
import { LiveStats } from "@/components/LiveStats.tsx";
import { FeesChart } from "@/components/FeesChart.tsx";
import { XIcon } from "@/components/XIcon.tsx";
import { FeeFlow } from "@/components/FeeFlow.tsx";
import { ProjectCoin } from "@/components/ProjectCoin.tsx";
import { marketWithin } from "@/lib/marketData.ts";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ notfound?: string }> }) {
  const { notfound } = await searchParams;
  const d = db();
  const feeHandle = config.detect.handle ? `@${config.detect.handle}` : config.appName;
  const stats = getStats(d);
  const projectMarket = config.projectCoin.address ? await marketWithin(config.projectCoin.address) : null;
  const share = config.recipientShareBps / 100;

  const minMilestone = formatUsd(config.milestones.list[0]);
  const xUrl = config.detect.handle ? `https://x.com/${config.detect.handle}` : null;
  const viaXMoney = config.payoutProvider === "xmoney";

  return (
    <>
      <div className="hero hero-split">
        <div>
          <div className="eyebrow">
            <span className="dot" /> Live on Robinhood Chain · built for long.xyz
          </div>
          <h1>
            Send long.xyz token fees to <span className="hl">any X account.</span>
          </h1>
          <p className="lede">
            Launch on app.long.xyz, send the fees to {feeHandle} and write <strong>fees @yourhandle</strong> in the bio.{" "}
            {share}% of the creator fees are paid out to that X account in dollars{viaXMoney ? " through X Money" : ""}. The other{" "}
            {100 - share}% buys back and burns.
          </p>
          <div className="cta-row">
            <Link className="btn" href="/launch">
              Launch a token
            </Link>
            {viaXMoney ? (
              <Link className="btn btn-ghost" href="/check">
                Check a token
              </Link>
            ) : (
              <Link className="btn btn-ghost" href="/wallet">
                Claim your fees
              </Link>
            )}
            {xUrl && (
              <a className="btn btn-ghost btn-icon" href={xUrl} target="_blank" rel="noreferrer" aria-label={`${feeHandle} on X`}>
                <XIcon /> {feeHandle}
              </a>
            )}
          </div>
          <Lookup />
          {notfound !== undefined && (
            <p className="field-error" style={{ marginTop: 10 }}>
              &quot;{notfound}&quot; isn&apos;t an X handle or a token address. Try @handle or 0x…
            </p>
          )}
        </div>

        <div className="flow-card" aria-label="How a launch is set up">
          <div className="flow-head">
            <span className="flow-dot" />
            <span className="flow-dot" />
            <span className="flow-dot" />
            <span className="muted mono">app.long.xyz · create</span>
          </div>
          <div className="flow-field">
            <span className="copy-label">Token</span>
            <span>
              <strong>$MOON</strong> <span className="muted">Moon Nvidia</span>
            </span>
          </div>
          <div className="flow-field">
            <span className="copy-label">Fee receiver</span>
            <span className="mono">{feeHandle}</span>
          </div>
          <div className="flow-field">
            <span className="copy-label">Bio</span>
            <span className="mono">
              to the moon. <span className="hl-text">fees @alice</span>
            </span>
          </div>
          <div className="flow-arrow">↓ {config.appName} detects it on chain</div>
          <div className="flow-result">
            <div>
              <div className="copy-label">@alice earns</div>
              <div className="flow-big">{share}%</div>
            </div>
            <div>
              <div className="copy-label">Buyback &amp; burn</div>
              <div className="flow-big burn">{100 - share}%</div>
            </div>
          </div>
        </div>
      </div>

      <LiveStats initial={stats} />

      {config.projectCoin.address && (
        <ProjectCoin
          address={config.projectCoin.address}
          fallbackSymbol={config.projectCoin.symbol}
          initial={projectMarket}
          buyUrl={config.projectCoin.buyUrl}
          buyLabel="Buy on long.xyz"
          explorerUrl={config.chain.explorerUrl}
        />
      )}

      <section>
        <h2>How it works</h2>
        <div className="steps">
          <div className="step">
            <div className="n">01</div>
            <h3>Launch on app.long.xyz</h3>
            <p>
              Set the fee receiver to {feeHandle} and write <strong>fees @yourhandle</strong> in the bio. {config.appName} picks the
              token up automatically. <Link href="/launch">Launch guide.</Link>
            </p>
          </div>
          <div className="step">
            <div className="n">02</div>
            <h3>Fees are claimed on-chain</h3>
            <p>Creator fees are claimed regularly. Every claim is published with its transaction hash and credited to the X account.</p>
          </div>
          <div className="step">
            <div className="n">03</div>
            <h3>{viaXMoney ? "Paid through X Money" : "Paid out in dollars"}</h3>
            {viaXMoney ? (
              <p>
                The first payout goes out at {minMilestone} earned, then at every milestone after that, in dollars straight to the
                X account&apos;s X Money. Nothing to connect.
              </p>
            ) : (
              <p>
                The first payout goes out at {minMilestone} earned, then at every milestone after that. <Link href="/wallet">Connect a wallet</Link>{" "}
                and link your X account to receive it.
              </p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>Where the fees go</h2>
        <FeeFlow share={share} handle={config.detect.handle || "longpaid"} />
      </section>

      <section className="two-col">
        <div className="panel">
          <h2>Where every dollar goes</h2>
          <p className="muted">Example: $100 of creator fees claimed from a token whose bio says fees @alice.</p>
          <div className="split big" aria-hidden>
            <div className="a" style={{ width: `${share}%` }} />
            <div className="b" style={{ width: `${100 - share}%` }} />
          </div>
          <div className="split-rows">
            <div>
              <i style={{ background: "var(--accent)" }} />
              <span>To @alice, paid in dollars{viaXMoney ? " via X Money" : ""}</span>
              <strong>${share}</strong>
            </div>
            <div>
              <i style={{ background: "var(--burn)" }} />
              <span>Buys back and burns</span>
              <strong>${100 - share}</strong>
            </div>
          </div>
        </div>
        <div className="panel">
          <h2>Payout milestones</h2>
          <p className="muted">
            Each time an account&apos;s lifetime earnings cross a milestone, its whole balance is sent. Nothing is lost while it
            waits.
          </p>
          <ol className="milestones">
            {config.milestones.list.map((m) => (
              <li key={m}>{formatUsd(m).replace(".00", "")}</li>
            ))}
            <li className="muted">every {formatUsd(config.milestones.stepMicros).replace(".00", "")} after</li>
          </ol>
        </div>
      </section>

      <section>
        <h2>Built to be trusted</h2>
        <div className="features">
          <div className="feature">
            <h3>Verified on chain</h3>
            <p>A token only counts when its launch transaction names {config.appName} as fee receiver. A bio alone can&apos;t fake it.</p>
          </div>
          <div className="feature">
            <h3>Every claim is public</h3>
            <p>Claims are recorded with their transaction hash and checked on chain before anything is credited.</p>
          </div>
          <div className="feature">
            <h3>No double payouts</h3>
            <p>A payout that may already be on its way is held for review, never sent twice.</p>
          </div>
          {viaXMoney ? (
            <div className="feature">
              <h3>Straight to X Money</h3>
              <p>Payouts are sent in dollars to the @handle itself, through X Money. No wallet, no bridge, no crypto needed.</p>
            </div>
          ) : (
            <div className="feature">
              <h3>Your handle, your wallet</h3>
              <p>Payouts go to a wallet only after it signs and the X account posts a code. Nobody can redirect them.</p>
            </div>
          )}
          <div className="feature">
            <h3>No sign-up needed</h3>
            <p>
              Named accounts start earning right away.{" "}
              {viaXMoney ? "Payouts arrive in X Money on their own." : "Link a wallet whenever you like; the balance waits for you."}
            </p>
          </div>
          <div className="feature">
            <h3>Opt out anytime</h3>
            <p>Don&apos;t want fees from a token that names you? Tell us from your X account and your share is burned instead.</p>
          </div>
        </div>
      </section>

      <section>
        <h2>Fees claimed, last 14 days</h2>
        <FeesChart data={dailyFees(d, 14)} />
      </section>

      <section>
        <h2>Recent claims</h2>
        <ClaimsTable rows={recentClaims(d, { limit: 10 })} />
      </section>

      <section>
        <h2>Top tokens</h2>
        <TokensTable rows={listTokens(d, { limit: 10 })} />
      </section>

      <section>
        <h2>FAQ</h2>
        <div className="faq">
          <details>
            <summary>Do I need to sign up to earn?</summary>
            {viaXMoney ? (
              <p>
                No. If a token&apos;s bio says fees @you and its fees go to {feeHandle}, you&apos;re earning, and payouts are sent to
                your @handle through X Money. There&apos;s nothing to connect.
              </p>
            ) : (
              <p>
                No. If a token&apos;s bio says fees @you and its fees go to {feeHandle}, you&apos;re earning. To receive payouts,{" "}
                <Link href="/wallet">connect a wallet</Link> and link your X account once.
              </p>
            )}
          </details>
          <details>
            <summary>Is my token still a normal long.xyz token?</summary>
            <p>Yes. You launch on app.long.xyz, so it&apos;s listed there and trades like any other long.xyz token.</p>
          </details>
          {viaXMoney && (
            <details>
              <summary>How do I receive X Money?</summary>
              <p>
                X Money lives in the X app (Wallet tab). If your account can&apos;t receive it yet, your payout isn&apos;t lost: it
                goes back to your balance and is sent with your next milestone.
              </p>
            </details>
          )}
          <details>
            <summary>How fast is my token picked up?</summary>
            <p>
              Usually within a few minutes. Check any token at <Link href="/check">/check</Link>.
            </p>
          </details>
          <details>
            <summary>When do I get paid?</summary>
            <p>
              At every milestone: {config.milestones.list.map((m) => formatUsd(m).replace(".00", "")).join(", ")} and every{" "}
              {formatUsd(config.milestones.stepMicros).replace(".00", "")} after. Each payout sends your full balance.
            </p>
          </details>
          <details>
            <summary>What if I forgot to write fees @handle in the bio?</summary>
            <p>The token still shows up for the team, who can assign the right handle by hand. Reach out on X.</p>
          </details>
          <details>
            <summary>Is {config.appName} part of long.xyz?</summary>
            <p>No. {config.appName} is an independent project built on top of long.xyz.</p>
          </details>
        </div>
      </section>

      <section className="cta-band">
        <div>
          <h2>Launch a token that pays someone.</h2>
          <p className="muted">
            Fee receiver {feeHandle} · bio <span className="mono">fees @yourhandle</span>
          </p>
        </div>
        <div className="cta-row">
          <Link className="btn" href="/launch">
            Launch guide
          </Link>
          {xUrl && (
            <a className="btn btn-ghost btn-icon" href={xUrl} target="_blank" rel="noreferrer">
              <XIcon /> Follow {feeHandle}
            </a>
          )}
        </div>
      </section>
    </>
  );
}
