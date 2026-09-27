import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { config } from "@/lib/config.ts";
import { db } from "@/lib/server.ts";
import { isSolanaAddress } from "@/lib/address.ts";
import { coinBio, coinImage, coinSocials, getCoin } from "@/lib/coins.ts";
import { marketWithin } from "@/lib/marketData.ts";
import { CoinLive } from "@/components/CoinLive.tsx";
import { ExternalCoin } from "@/components/ExternalCoin.tsx";
import { launcher } from "@/lib/launch-api.ts";
import { CopyButton } from "@/components/CopyButton.tsx";
import { XIcon } from "@/components/XIcon.tsx";
import { shortAddr } from "@/components/Tables.tsx";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ mint: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mint } = await params;
  const c = isSolanaAddress(mint) ? getCoin(db(), mint) : null;
  if (!c) {
    const m = isSolanaAddress(mint) ? await marketWithin(mint, 2000) : null;
    return { title: m?.symbol ? `$${m.symbol}${m.name ? ` (${m.name})` : ""} · ${config.appName}` : `Coin · ${config.appName}`, openGraph: m?.image ? { images: [m.image] } : undefined };
  }
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
  if (!c) {
    // Not launched here: LongPaid's own coin, or any coin with market data, gets a live market page.
    const isProject = mint === config.projectCoin.mint;
    const market = await marketWithin(mint, 5000);
    if (!isProject && !market?.symbol && !market?.chartUrl) notFound();
    return (
      <ExternalCoin
        mint={mint}
        market={market}
        official={isProject}
        fallbackSymbol={isProject ? config.projectCoin.symbol : ""}
        explorerUrl={config.chain.explorerUrl}
        tradeUrl={config.launchpad.tokenUrl.replace("{mint}", mint)}
        network={config.launchpad.network}
        launchpad={config.launchpad.name}
        appName={config.appName}
      />
    );
  }
  // Settle a launch whose confirmation or listing hasn't been seen yet.
  if (config.launch.enabled && (c.status === "submitted" || !c.listed)) c = (await launcher().refresh(c.id).catch(() => c)) ?? c;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto")?.split(",")[0] ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const pageUrl = `${origin}/coin/${mint}`;
  const market = await marketWithin(mint);
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

      <CoinLive mint={mint} initial={market} symbol={c.symbol} />

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
          </dl>
        </section>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Launched on {config.appName} · <Link href="/coins">All coins</Link>
      </p>
    </div>
  );
}
