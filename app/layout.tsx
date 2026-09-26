import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config.ts";
import { Logo } from "@/components/Logo.tsx";
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
        <header className="site">
          <div className="wrap">
            <Link href="/" className="brand">
              <Logo size={26} /> {config.appName}
            </Link>
            <nav className="links">
              <Link href="/launch">Launch</Link>
              <Link href="/check">Check</Link>
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/account">Account</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap">
            {config.appName} is an independent project. It is not affiliated with long.xyz or X.
          </div>
        </footer>
      </body>
    </html>
  );
}
