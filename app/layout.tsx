import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config.ts";
import { Logo } from "@/components/Logo.tsx";
import { WalletProvider } from "@/components/WalletProvider.tsx";
import { ConnectButton } from "@/components/ConnectButton.tsx";
import { XIcon } from "@/components/XIcon.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: `${config.appName} — creator fees for long.xyz tokens, paid to X accounts`,
  description:
    "Point a long.xyz token's creator fees at any X account. Fees are claimed on-chain, 80% is paid out in dollars and 20% buys back and burns.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="brand">
              <Logo size={26} /> {config.appName}
            </Link>
            <div className="nav-right">
              <nav className="links">
                <Link href="/launch">Launch</Link>
                <Link href="/check">Check</Link>
                <Link href="/leaderboard">Leaderboard</Link>
                <Link href="/docs">Docs</Link>
              </nav>
              {config.detect.handle && (
                <a className="x-link" href={`https://x.com/${config.detect.handle}`} target="_blank" rel="noreferrer" aria-label={`@${config.detect.handle} on X`}>
                  <XIcon size={15} />
                </a>
              )}
              {config.payoutProvider === "erc20" && <ConnectButton />}
            </div>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap footer-grid">
            <div>
              <Link href="/" className="brand">
                <Logo size={22} /> {config.appName}
              </Link>
              <p className="muted" style={{ marginTop: 10, maxWidth: 360 }}>
                Launch on long.xyz, send the fees to any X account. {config.recipientShareBps / 100}% paid out in dollars,{" "}
                {100 - config.recipientShareBps / 100}% buyback and burn.
              </p>
              {config.projectCoin.address && (
                <p className="footer-ca">
                  <span className="copy-label">CA</span>{" "}
                  <a className="mono" href="/#coin">
                    {config.projectCoin.address}
                  </a>
                </p>
              )}
            </div>
            <div className="footer-links">
              <span className="copy-label">Product</span>
              <Link href="/launch">Launch guide</Link>
              <Link href="/check">Check a token</Link>
              {config.payoutProvider === "erc20" && <Link href="/wallet">Claim your fees</Link>}
              <Link href="/leaderboard">Leaderboard</Link>
            </div>
            <div className="footer-links">
              <span className="copy-label">Resources</span>
              <Link href="/docs">Docs</Link>
              <a href="https://app.long.xyz" target="_blank" rel="noreferrer">app.long.xyz</a>
              {config.detect.handle && (
                <a href={`https://x.com/${config.detect.handle}`} target="_blank" rel="noreferrer">
                  X · @{config.detect.handle}
                </a>
              )}
            </div>
          </div>
          <div className="wrap footer-note">
            {config.appName} is an independent project. It is not affiliated with long.xyz or X.
          </div>
        </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
