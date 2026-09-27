import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { config } from "@/lib/config.ts";
import { db } from "@/lib/server.ts";
import { isSolanaAddress } from "@/lib/address.ts";
import { coinBio, coinImage, coinSocials, getCoin } from "@/lib/coins.ts";
import { coinStats, fmtUsd } from "@/lib/market.ts";
import { launcher } from "@/lib/launch-api.ts";
import { CopyButton } from "@/components/CopyButton.tsx";
import { XIcon } from "@/components/XIcon.tsx";
import { shortAddr } from "@/components/Tables.tsx";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ mint: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mint } = await params;
  const c = isSolanaAddress(mint) ? getCoin(db(), mint) : null;
  if (!c) return { title: `Coin · ${config.appName}` };
  return {
    title: `${c.name} ($${c.symbol}) · ${config.appName}`,
    description: coinBio(c) || `${c.name} on ${config.launchpad.name}`,
    openGraph: { images: [coinImage(c)] },
  };
}

export default async function Coin({ params }: Params) {
  const { mint } = await params;
  if (!isSolanaAddress(mint)) notFound();
  let c = getCoin(db(), mint);
  if (!c) notFound();
  // Settle a launch whose confirmation or listing hasn't been seen yet.
  if (config.launch.enabled && (c.status === "submitted" || !c.listed)) c = (await launcher().refresh(c.id).catch(() => c)) ?? c;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto")?.split(",")[0] ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const pageUrl = `${origin}/coin/${mint}`;
  const stats = await coinStats(mint);
  const socials = coinSocials(c);
  const bio = coinBio(c);
  const explorer = config.chain.explorerUrl;
  const tradeUrl = config.launchpad.tokenUrl.replace("{mint}", mint);
  const share = `https://x.com/intent/tweet?text=${encodeURIComponent(
    `$${c.symbol} is live on ${config.launchpad.name}${c.handle ? ` · fees @${c.handle}` : ""}`,
  )}&url=${encodeURIComponent(pageUrl)}`;

  return (
    <div className="coin">
      <div className="coin-hero">
        <img src={coinImage(c)} alt="" className="coin-logo" />
        <div className="coin-title">
          <div className="coin-badges">
            <span className="pill">{config.launchpad.network}</span>
            <span className="pill">{config.launchpad.name}</span>
            {c.status === "submitted" ? (
              <span className="pill">confirming</span>
            ) : c.listed ? (
              <span className="pill paid">listed</span>
            ) : (
              <span className="pill">listing soon</span>
            )}
            {stats?.graduated && <span className="pill paid">graduated</span>}
          </div>
          <h1>
            {c.name} <span className="muted">${c.symbol}</span>
          </h1>
          <div className="copy-row coin-mint">
            <code>{mint}</code>
            <CopyButton text={mint} />
          </div>
        </div>
      </div>

      <div className="coin-actions">
        <a className="btn" href={tradeUrl} target="_blank" rel="noreferrer">
          Trade on {config.launchpad.name}
        </a>
        <a className="btn btn-ghost" href={`https://jup.ag/swap/SOL-${mint}`} target="_blank" rel="noreferrer">
          Jupiter
        </a>
        <a className="btn btn-ghost" href={`${explorer}/token/${mint}`} target="_blank" rel="noreferrer">
          Explorer
        </a>
        {socials.twitter && (
          <a className="btn btn-ghost btn-icon" href={socials.twitter} target="_blank" rel="noreferrer" aria-label="X">
            <XIcon />
          </a>
        )}
        {socials.website && (
          <a className="btn btn-ghost" href={socials.website} target="_blank" rel="noreferrer">
            Website
          </a>
        )}
        {socials.telegram && (
          <a className="btn btn-ghost" href={socials.telegram} target="_blank" rel="noreferrer">
            Telegram
          </a>
        )}
        <a className="btn btn-ghost" href={share} target="_blank" rel="noreferrer">
          Share
        </a>
      </div>

      {c.handle && (
        <div className="coin-fees">
          <span className="mono">fees @{c.handle}</span>
          <span className="muted">
            The bio names{" "}
            <a href={`https://x.com/${c.handle}`} target="_blank" rel="noreferrer">
              @{c.handle}
            </a>
            . Creator fees from trading go to the creator wallet ({shortAddr(c.wallet)}).
          </span>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">Market cap</div>
          <div className="value">{fmtUsd(stats?.marketCapUsd ?? null)}</div>
        </div>
        <div className="stat">
          <div className="label">Price</div>
          <div className="value">{fmtUsd(stats?.priceUsd ?? null, false)}</div>
        </div>
        <div className="stat">
          <div className="label">24h volume</div>
          <div className="value">{fmtUsd(stats?.volume24hUsd ?? null)}</div>
        </div>
        <div className="stat">
          <div className="label">Holders</div>
          <div className="value">{stats?.holders?.toLocaleString("en-US") ?? "—"}</div>
        </div>
      </div>

      {stats?.progress !== null && stats?.progress !== undefined && !stats.graduated && (
        <div className="coin-progress" aria-label="Bonding curve progress">
          <div className="coin-progress-head">
            <span>Bonding curve</span>
            <span className="mono">{stats.progress.toFixed(1)}%</span>
          </div>
          <div className="coin-progress-bar">
            <span style={{ width: `${stats.progress}%` }} />
          </div>
        </div>
      )}

      <section>
        <h2>Chart</h2>
        <div className="coin-chart">
          <iframe
            title={`${c.symbol} chart`}
            src={`https://dexscreener.com/solana/${mint}?embed=1&theme=dark&info=0&trades=0`}
            loading="lazy"
          />
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Chart not showing yet? New coins appear on charts after their first trades.{" "}
          <a href={`https://dexscreener.com/solana/${mint}`} target="_blank" rel="noreferrer">
            Open on DEX Screener
          </a>
        </p>
      </section>

      <div className="two-col coin-lower">
        <section>
          <h2>About</h2>
          <p className="coin-bio">{bio || <span className="muted">No description.</span>}</p>
        </section>
        <section>
          <h2>Details</h2>
          <dl className="coin-details">
            <dt>Mint</dt>
            <dd>
              <a className="mono" href={`${explorer}/token/${mint}`} target="_blank" rel="noreferrer">
                {shortAddr(mint)}
              </a>
            </dd>
            {c.pool && (
              <>
                <dt>Pool</dt>
                <dd>
                  <a className="mono" href={`${explorer}/account/${c.pool}`} target="_blank" rel="noreferrer">
                    {shortAddr(c.pool)}
                  </a>
                </dd>
              </>
            )}
            <dt>Creator</dt>
            <dd>
              <a className="mono" href={`${explorer}/account/${c.wallet}`} target="_blank" rel="noreferrer">
                {shortAddr(c.wallet)}
              </a>
            </dd>
            <dt>Launched</dt>
            <dd>{new Date(c.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</dd>
            {c.signature && (
              <>
                <dt>Launch tx</dt>
                <dd>
                  <a className="mono" href={`${explorer}/tx/${c.signature}`} target="_blank" rel="noreferrer">
                    {shortAddr(c.signature)}
                  </a>
                </dd>
              </>
            )}
            {stats?.quoteSymbol && (
              <>
                <dt>Pair</dt>
                <dd>{stats.quoteSymbol}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Launched on {config.appName} · <Link href="/coins">All coins</Link>
      </p>
    </div>
  );
}
