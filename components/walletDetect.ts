"use client";

// Finds the Solana wallets installed in this browser. Current wallets (Phantom, Solflare, Backpack, Glow, OKX,
// Coinbase…) register through the Wallet Standard; older ones only inject a provider on window. Both end up as the
// same small provider interface the rest of the site uses.

import { Transaction, VersionedTransaction } from "@solana/web3.js";

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

export type DetectedWallet = { name: string; icon: string | null; provider: SolanaProvider };

type StdAccount = { address: string; publicKey: Uint8Array; chains?: readonly string[] };
type StdWallet = {
  name: string;
  icon?: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, Record<string, (...a: never[]) => unknown>>;
};

declare global {
  interface Window {
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    backpack?: SolanaProvider | { solana?: SolanaProvider };
    glowSolana?: SolanaProvider;
    solana?: SolanaProvider & { isPhantom?: boolean; isSolflare?: boolean; isBackpack?: boolean; isGlow?: boolean };
  }
}

const standard = new Map<string, StdWallet>();
let listening = false;
const subscribers = new Set<() => void>();

function register(...wallets: StdWallet[]) {
  let added = false;
  for (const w of wallets) {
    const solana = w.chains?.some((c) => c.startsWith("solana:"));
    if (solana && w.features?.["standard:connect"] && w.features?.["solana:signTransaction"] && !standard.has(w.name)) {
      standard.set(w.name, w);
      added = true;
    }
  }
  if (added) subscribers.forEach((f) => f());
  return () => {};
}

/** Starts listening for Wallet Standard wallets (idempotent). `onChange` runs when a new one registers. */
export function watchWallets(onChange: () => void): () => void {
  subscribers.add(onChange);
  if (!listening && typeof window !== "undefined") {
    listening = true;
    const api = { register };
    window.addEventListener("wallet-standard:register-wallet", (e) => {
      const cb = (e as CustomEvent).detail as (api: { register: typeof register }) => void;
      try {
        cb(api);
      } catch {}
    });
    try {
      window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
    } catch {}
  }
  return () => subscribers.delete(onChange);
}

function b58(bytes: Uint8Array): string {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) {
    s = A[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}

/** Wraps a Wallet Standard wallet in the provider interface. */
function fromStandard(w: StdWallet): SolanaProvider {
  let account: StdAccount | null = w.accounts?.[0] ?? null;
  const key = (a: StdAccount) => ({ toBase58: () => a.address || b58(a.publicKey) });
  const listeners = new Map<Listener, () => void>();
  const connectF = w.features["standard:connect"] as unknown as { connect(i?: { silent?: boolean }): Promise<{ accounts: readonly StdAccount[] }> };
  const disconnectF = w.features["standard:disconnect"] as unknown as { disconnect(): Promise<void> } | undefined;
  const signF = w.features["solana:signTransaction"] as unknown as {
    signTransaction(...i: { account: StdAccount; transaction: Uint8Array; chain?: string }[]): Promise<{ signedTransaction: Uint8Array }[]>;
  };
  const eventsF = w.features["standard:events"] as unknown as { on(e: "change", f: (p: { accounts?: readonly StdAccount[] }) => void): () => void } | undefined;

  const p: SolanaProvider = {
    get publicKey() {
      return account ? key(account) : null;
    },
    async connect(opts) {
      const r = await connectF.connect(opts?.onlyIfTrusted ? { silent: true } : undefined);
      const accts = r?.accounts?.length ? r.accounts : w.accounts;
      account = accts?.find((a) => !a.chains || a.chains.some((c) => c.startsWith("solana:"))) ?? accts?.[0] ?? null;
      if (!account) throw new Error("The wallet didn't share an account.");
      return { publicKey: key(account) };
    },
    async disconnect() {
      account = null;
      await disconnectF?.disconnect();
    },
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if (!account) throw new Error("Connect the wallet first.");
      const bytes = tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const [out] = await signF.signTransaction({ account, transaction: bytes, chain: "solana:mainnet" });
      return (tx instanceof VersionedTransaction ? VersionedTransaction.deserialize(out.signedTransaction) : Transaction.from(out.signedTransaction)) as T;
    },
    on(event, fn) {
      if (!eventsF || event !== "accountChanged") {
        if (event === "disconnect" && eventsF) {
          const off = eventsF.on("change", ({ accounts }) => accounts && accounts.length === 0 && fn());
          listeners.set(fn, off);
        }
        return;
      }
      const off = eventsF.on("change", ({ accounts }) => {
        if (!accounts) return;
        account = accounts[0] ?? null;
        fn(account ? key(account) : null);
      });
      listeners.set(fn, off);
    },
    off(_event, fn) {
      listeners.get(fn)?.();
      listeners.delete(fn);
    },
  };
  return p;
}

function legacy(): { name: string; provider: SolanaProvider }[] {
  const out: { name: string; provider: SolanaProvider }[] = [];
  const bp = window.backpack as { solana?: SolanaProvider } | SolanaProvider | undefined;
  const backpack = bp && "signTransaction" in bp ? (bp as SolanaProvider) : (bp as { solana?: SolanaProvider } | undefined)?.solana;
  if (window.phantom?.solana) out.push({ name: "Phantom", provider: window.phantom.solana });
  if (window.solflare) out.push({ name: "Solflare", provider: window.solflare });
  if (backpack) out.push({ name: "Backpack", provider: backpack });
  if (window.glowSolana) out.push({ name: "Glow", provider: window.glowSolana });
  const s = window.solana;
  if (s && !out.some((o) => o.provider === s)) {
    const name = s.isPhantom ? "Phantom" : s.isSolflare ? "Solflare" : s.isBackpack ? "Backpack" : s.isGlow ? "Glow" : "Solana wallet";
    if (!out.some((o) => o.name === name)) out.push({ name, provider: s });
  }
  return out;
}

const wrapped = new Map<string, SolanaProvider>();

/** Every Solana wallet available right now, Wallet Standard first (one entry per wallet name). */
export function detectWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const out: DetectedWallet[] = [];
  for (const w of standard.values()) {
    if (!wrapped.has(w.name)) wrapped.set(w.name, fromStandard(w));
    out.push({ name: w.name, icon: w.icon ?? null, provider: wrapped.get(w.name)! });
  }
  for (const l of legacy()) if (!out.some((o) => o.name.toLowerCase() === l.name.toLowerCase())) out.push({ ...l, icon: null });
  return out;
}

export const INSTALL_LINKS = [
  { name: "Phantom", url: "https://phantom.com" },
  { name: "Solflare", url: "https://solflare.com" },
  { name: "Backpack", url: "https://backpack.app" },
];
