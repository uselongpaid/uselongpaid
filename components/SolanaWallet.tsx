"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

// One Solana wallet connection for the whole site: the header button connects, switches and disconnects it, and the
// launch form signs with whatever is connected. Phantom, Solflare and Backpack inject a provider on window.

type PubKey = { toBase58(): string };
type Listener = (...args: unknown[]) => void;

export type SolanaProvider = {
  publicKey?: PubKey | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PubKey } | void>;
  disconnect?(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  on?(event: string, fn: Listener): void;
  off?(event: string, fn: Listener): void;
  removeListener?(event: string, fn: Listener): void;
};

declare global {
  interface Window {
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
    solana?: SolanaProvider;
  }
}

export type WalletOption = { name: string; url: string; get: () => SolanaProvider | undefined };

export const WALLETS: WalletOption[] = [
  { name: "Phantom", url: "https://phantom.com", get: () => window.phantom?.solana },
  { name: "Solflare", url: "https://solflare.com", get: () => window.solflare },
  { name: "Backpack", url: "https://backpack.app", get: () => window.backpack },
];

const STORAGE_KEY = "longpaid.wallet";

type Ctx = {
  address: string | null;
  walletName: string | null;
  provider: SolanaProvider | null;
  connecting: boolean;
  error: string | null;
  installed: WalletOption[];
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
  const [installed, setInstalled] = useState<WalletOption[]>([]);
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
    // Wallet extensions inject after load in some browsers; look again shortly after.
    const scan = () => setInstalled(WALLETS.filter((w) => w.get()));
    scan();
    const t = setTimeout(scan, 600);

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {}
    const w = WALLETS.find((x) => x.name === saved);
    const p = w?.get();
    // Reconnect silently only if the wallet already trusts this site.
    if (w && p) {
      p.connect({ onlyIfTrusted: true })
        .then((r) => attach(w.name, p, r ? r.publicKey : p.publicKey))
        .catch(() => remember(null));
    }
    return () => {
      clearTimeout(t);
      detach.current?.();
    };
  }, [attach]);

  const connect = useCallback(
    async (name: string) => {
      const w = WALLETS.find((x) => x.name === name);
      const p = w?.get();
      if (!w || !p) {
        setError(`${name} isn't installed.`);
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
    <WalletCtx.Provider value={{ address, walletName, provider, connecting, error, installed, connect, disconnect, menuOpen, setMenuOpen }}>
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
    w.setMenuOpen(!w.menuOpen);
  }

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
              {WALLETS.map((opt) => {
                const has = w.installed.some((i) => i.name === opt.name);
                const current = w.walletName === opt.name;
                return has ? (
                  <button key={opt.name} type="button" role="menuitem" disabled={w.connecting} onClick={() => w.connect(opt.name)}>
                    {opt.name}
                    {current ? <span className="muted"> · pick another account</span> : null}
                  </button>
                ) : (
                  <a key={opt.name} role="menuitem" href={opt.url} target="_blank" rel="noreferrer" className="muted">
                    {opt.name} <span style={{ fontSize: 12 }}>· install</span>
                  </a>
                );
              })}
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
