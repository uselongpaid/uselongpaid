"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

// One Solana wallet connection for the whole site: the header button connects, switches and disconnects it, and the
// launch form signs with whatever is connected. Any installed Solana wallet shows up (see walletDetect.ts).

import { type DetectedWallet, INSTALL_LINKS, type SolanaProvider, detectWallets, watchWallets } from "./walletDetect.ts";

export type { SolanaProvider } from "./walletDetect.ts";

type PubKey = { toBase58(): string };
type Listener = (...args: unknown[]) => void;

const STORAGE_KEY = "longpaid.wallet";

type Ctx = {
  address: string | null;
  walletName: string | null;
  provider: SolanaProvider | null;
  connecting: boolean;
  error: string | null;
  installed: DetectedWallet[];
  rescan(): void;
  connect(name: string): Promise<void>;
  disconnect(): Promise<void>;
  menuOpen: boolean;
  setMenuOpen(open: boolean): void;
};

const WalletCtx = createContext<Ctx | null>(null);

export function useSolanaWallet(): Ctx {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useSolanaWallet needs <SolanaWalletProvider>");
  return c;
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function remember(name: string | null) {
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState<DetectedWallet[]>([]);
  const rescan = useCallback(() => setInstalled(detectWallets()), []);
  const [provider, setProvider] = useState<SolanaProvider | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const detach = useRef<(() => void) | null>(null);

  const attach = useCallback((name: string, p: SolanaProvider, pk: PubKey | null | undefined) => {
    detach.current?.();
    const onAccount: Listener = (next) => {
      const k = next as PubKey | null;
      if (k) setAddress(k.toBase58());
      else {
        // Switched to an account that hasn't approved this site yet: ask again.
        p.connect().then((r) => r && setAddress(r.publicKey.toBase58())).catch(() => setAddress(null));
      }
    };
    const onDisconnect: Listener = () => {
      setAddress(null);
      setProvider(null);
      setWalletName(null);
    };
    p.on?.("accountChanged", onAccount);
    p.on?.("disconnect", onDisconnect);
    detach.current = () => {
      const off = (p.off ?? p.removeListener)?.bind(p);
      off?.("accountChanged", onAccount);
      off?.("disconnect", onDisconnect);
    };
    setProvider(p);
    setWalletName(name);
    setAddress((pk ?? p.publicKey)?.toBase58() ?? null);
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    let tried = false;
    // Reconnect silently, once, as soon as the remembered wallet shows up, and only if it still trusts this site.
    const scan = () => {
      const list = detectWallets();
      setInstalled(list);
      const w = list.find((x) => x.name === saved);
      if (w && !tried) {
        tried = true;
        w.provider
          .connect({ onlyIfTrusted: true })
          .then((r) => attach(w.name, w.provider, r ? r.publicKey : w.provider.publicKey))
          .catch(() => {});
      }
    };
    const stop = watchWallets(scan);
    scan();
    // Some extensions inject a little after the page loads.
    const timers = [300, 1000, 2500].map((ms) => setTimeout(scan, ms));
    return () => {
      stop();
      timers.forEach(clearTimeout);
      detach.current?.();
    };
  }, [attach]);

  const connect = useCallback(
    async (name: string) => {
      const w = detectWallets().find((x) => x.name === name);
      const p = w?.provider;
      if (!w || !p) {
        setError(`${name} isn't available in this browser.`);
        return;
      }
      setConnecting(true);
      setError(null);
      try {
        // Leave the current wallet first, so switching (or re-picking an account in the same wallet) starts clean.
        detach.current?.();
        if (provider) await provider.disconnect?.().catch(() => {});
        const r = await p.connect();
        attach(w.name, p, r ? r.publicKey : p.publicKey);
        remember(w.name);
        setMenuOpen(false);
      } catch (e) {
        setError((e as Error)?.message || "The wallet didn't connect.");
      } finally {
        setConnecting(false);
      }
    },
    [attach, provider],
  );

  const disconnect = useCallback(async () => {
    detach.current?.();
    detach.current = null;
    await provider?.disconnect?.().catch(() => {});
    setProvider(null);
    setWalletName(null);
    setAddress(null);
    remember(null);
    setMenuOpen(false);
  }, [provider]);

  return (
    <WalletCtx.Provider value={{ address, walletName, provider, connecting, error, installed, rescan, connect, disconnect, menuOpen, setMenuOpen }}>
      {children}
    </WalletCtx.Provider>
  );
}

/** Header button: connect, then a menu to copy the address, change wallet or disconnect. */
export function SolanaConnectButton() {
  const w = useSolanaWallet();
  const [view, setView] = useState<"account" | "choose">("choose");
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!w.menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) w.setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [w]);

  function toggle() {
    setView(w.address ? "account" : "choose");
    if (!w.menuOpen) w.rescan();
    w.setMenuOpen(!w.menuOpen);
  }

  useEffect(() => {
    if (w.menuOpen) w.rescan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.menuOpen]);

  async function copy() {
    if (!w.address) return;
    try {
      await navigator.clipboard.writeText(w.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div className="wallet-menu" ref={box}>
      <button type="button" className={`btn btn-small wallet-btn${w.address ? " connected" : ""}`} onClick={toggle} aria-expanded={w.menuOpen} aria-haspopup="menu">
        {w.address ? (
          <>
            <span className="dot" /> {shortAddress(w.address)}
          </>
        ) : w.connecting ? (
          "Connecting…"
        ) : (
          "Connect wallet"
        )}
      </button>

      {w.menuOpen && (
        <div className="wallet-pop" role="menu">
          {view === "account" && w.address ? (
            <>
              <div className="wallet-pop-head">
                <div className="muted" style={{ fontSize: 12 }}>
                  {w.walletName} · Solana
                </div>
                <div className="mono">{shortAddress(w.address)}</div>
              </div>
              <button type="button" role="menuitem" onClick={copy}>
                {copied ? "Copied" : "Copy address"}
              </button>
              <a role="menuitem" href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noreferrer">
                View on Solscan
              </a>
              <button type="button" role="menuitem" onClick={() => setView("choose")}>
                Change wallet
              </button>
              <button type="button" role="menuitem" className="danger" onClick={() => w.disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <div className="wallet-pop-head muted" style={{ fontSize: 13 }}>
                {w.address ? "Switch to" : "Connect a Solana wallet"}
              </div>
              {w.installed.length ? (
                w.installed.map((opt) => (
                  <button key={opt.name} type="button" role="menuitem" className="wallet-opt" disabled={w.connecting} onClick={() => w.connect(opt.name)}>
                    {opt.icon ? <img src={opt.icon} alt="" width={20} height={20} /> : <span className="wallet-opt-icon" />}
                    {opt.name}
                    {w.walletName === opt.name ? <span className="muted"> · pick another account</span> : null}
                  </button>
                ))
              ) : (
                <>
                  <div className="muted" style={{ fontSize: 13, padding: "6px 12px" }}>
                    No Solana wallet found in this browser. On a phone, open this site in your wallet app&apos;s browser.
                  </div>
                  {INSTALL_LINKS.map((opt) => (
                    <a key={opt.name} role="menuitem" href={opt.url} target="_blank" rel="noreferrer" className="muted">
                      Get {opt.name}
                    </a>
                  ))}
                </>
              )}
              {w.error && <div className="field-error" style={{ padding: "6px 12px" }}>{w.error}</div>}
              {w.address && (
                <button type="button" role="menuitem" onClick={() => setView("account")}>
                  ← Back
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
