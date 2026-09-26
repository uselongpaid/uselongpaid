import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config.ts";
import { Logo } from "@/components/Logo.tsx";
import { WalletProvider } from "@/components/WalletProvider.tsx";
import { ConnectButton } from "@/components/ConnectButton.tsx";
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
              <ConnectButton />
            </div>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap">
            {config.appName} is an independent project. It is not affiliated with long.xyz or X.
          </div>
        </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
