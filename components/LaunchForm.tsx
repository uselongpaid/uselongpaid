"use client";

import { useEffect, useRef, useState } from "react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

// Launch on stonkfun.xyz from this site. The connected wallet signs and pays the launch itself (stonkfun's price);
// the site only relays the prepared and signed transaction to stonkfun's API.

type SolanaProvider = {
  isConnected?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
};

type Pair = { mint: string; symbol: string; name: string; logo: string | null; category: string | null };

type Launch = {
  id: string;
  status: "prepared" | "submitted" | "completed" | "failed";
  wallet: string;
  handle: string | null;
  symbol: string;
  costLamports: number;
  launchSig: string | null;
  mint: string | null;
  error: string | null;
};

declare global {
  interface Window {
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    backpack?: SolanaProvider;
    solana?: SolanaProvider;
  }
}

function findProviders(): { name: string; p: SolanaProvider }[] {
  const out: { name: string; p: SolanaProvider }[] = [];
  if (window.phantom?.solana) out.push({ name: "Phantom", p: window.phantom.solana });
  if (window.solflare) out.push({ name: "Solflare", p: window.solflare });
  if (window.backpack) out.push({ name: "Backpack", p: window.backpack });
  if (!out.length && window.solana) out.push({ name: "Wallet", p: window.solana });
  return out;
}

function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function decode(b64: string): Transaction | VersionedTransaction {
  const bytes = fromBase64(b64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}
const sol = (lamports: number) => `${(lamports / 1e9).toLocaleString("en-US", { maximumFractionDigits: 5 })} SOL`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export function LaunchForm({ launchpad, explorerUrl, ownHandle }: { launchpad: string; explorerUrl: string; ownHandle: string }) {
  const [provider, setProvider] = useState<{ name: string; p: SolanaProvider } | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [available, setAvailable] = useState<{ name: string; p: SolanaProvider }[]>([]);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [pairsError, setPairsError] = useState<string | null>(null);
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const polling = useRef(false);

  useEffect(() => {
    setAvailable(findProviders());
    api<{ pairs: Pair[] }>("/api/launch/pairs")
      .then((r) => setPairs(r.pairs))
      .catch((e: Error) => setPairsError(e.message));
  }, []);

  async function connect(choice: { name: string; p: SolanaProvider }) {
    setError(null);
    try {
      const r = await choice.p.connect();
      setProvider(choice);
      setWallet(r.publicKey.toBase58());
    } catch (e) {
      setError((e as Error).message || "The wallet didn't connect.");
    }
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 1_000_000) return setError("Logo must be under 1 MB.");
    const r = new FileReader();
    r.onload = () => setImage(String(r.result));
    r.readAsDataURL(f);
  }

  async function poll(id: string) {
    if (polling.current) return;
    polling.current = true;
    try {
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const l = await api<Launch>(`/api/launch/${id}`);
        setLaunch(l);
        if (l.status === "completed" || l.status === "failed") return;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      polling.current = false;
    }
  }

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!provider || !wallet) return setError("Connect a wallet first.");
    const f = new FormData(ev.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    setLaunch(null);
    try {
      setStep(`Preparing the launch on ${launchpad}…`);
      const prepared = await api<Launch & { transaction: string }>("/api/launch/prepare", {
        wallet,
        handle: get("handle"),
        name: get("name"),
        symbol: get("symbol"),
        description: get("description"),
        image: image || get("imageUrl"),
        quoteMint: get("quoteMint"),
        twitter: get("twitter"),
        website: get("website"),
        telegram: get("telegram"),
      });
      setStep(`Approve in ${provider.name}: about ${sol(prepared.costLamports)} goes to ${launchpad} for the launch.`);
      const signed = await provider.p.signTransaction(decode(prepared.transaction));
      const bytes = signed instanceof VersionedTransaction ? signed.serialize() : signed.serialize({ requireAllSignatures: false });
      setStep("Launching…");
      const l = await api<Launch>("/api/launch/submit", { id: prepared.id, signedTransaction: toBase64(bytes) });
      setLaunch(l);
      if (l.status === "submitted") void poll(l.id);
    } catch (e) {
      setError((e as Error).message || "Launch failed.");
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  if (launch?.status === "completed" && launch.mint) {
    return (
      <div className="panel launch-done">
        <h3>${launch.symbol} is live on {launchpad}</h3>
        <div className="copy-row">
          <code>{launch.mint}</code>
        </div>
        <p>
          <a href={`${explorerUrl}/token/${launch.mint}`} target="_blank" rel="noreferrer">
            View on explorer
          </a>
          {launch.launchSig && (
            <>
              {" · "}
              <a href={`${explorerUrl}/tx/${launch.launchSig}`} target="_blank" rel="noreferrer">
                Launch transaction
              </a>
            </>
          )}
        </p>
        <p className="muted">
          Creator fees from trading go to your wallet ({short(launch.wallet)}).
          {launch.handle ? ` The bio names @${launch.handle}.` : ""}
        </p>
        <button className="btn btn-ghost" type="button" onClick={() => setLaunch(null)}>
          Launch another
        </button>
      </div>
    );
  }

  return (
    <form className="panel stack launch-form" onSubmit={submit}>
      <div className="launch-wallet">
        {wallet ? (
          <span className="pill">
            <span className="dot" /> {provider?.name} · {short(wallet)}
          </span>
        ) : available.length ? (
          available.map((w) => (
            <button key={w.name} type="button" className="btn btn-small" onClick={() => connect(w)}>
              Connect {w.name}
            </button>
          ))
        ) : (
          <span className="muted">
            No Solana wallet found. Install <a href="https://phantom.com" target="_blank" rel="noreferrer">Phantom</a> or{" "}
            <a href="https://solflare.com" target="_blank" rel="noreferrer">Solflare</a>, or open this page in your wallet&apos;s browser.
          </span>
        )}
      </div>

      <div className="row2">
        <label className="field">
          <span>Name</span>
          <input name="name" maxLength={32} placeholder="Moon Nvidia" required />
        </label>
        <label className="field">
          <span>Ticker</span>
          <input name="symbol" maxLength={11} placeholder="MOON" required />
        </label>
      </div>

      <label className="field">
        <span>Logo</span>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {!image && (
        <label className="field">
          <span>…or logo link</span>
          <input name="imageUrl" placeholder="https://…" />
        </label>
      )}
      {image && <img src={image} alt="" className="launch-logo" />}

      <label className="field">
        <span>Trades against</span>
        {pairs && pairs.length ? (
          <select name="quoteMint" required defaultValue="">
            <option value="" disabled>
              Choose a pair
            </option>
            {pairs.map((p) => (
              <option key={p.mint} value={p.mint}>
                {p.symbol} · {p.name}
                {p.category ? ` (${p.category})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input name="quoteMint" placeholder={pairsError ? "Pair mint address" : "Loading pairs…"} required />
        )}
        {pairsError && <span className="field-error">Couldn&apos;t load pairs from {launchpad}: {pairsError}</span>}
      </label>

      <label className="field">
        <span>Description</span>
        <textarea name="description" rows={3} maxLength={400} placeholder="to the moon" />
      </label>

      <label className="field">
        <span>X handle for the bio (optional)</span>
        <input name="handle" placeholder="@yourhandle" />
        <span className="muted" style={{ fontSize: 13 }}>
          Adds &quot;fees @handle&quot; to the bio. The creator fees themselves go to the wallet that launches.
        </span>
      </label>

      <div className="row2">
        <label className="field">
          <span>X link (optional)</span>
          <input name="twitter" placeholder="https://x.com/…" />
        </label>
        <label className="field">
          <span>Website (optional)</span>
          <input name="website" placeholder="https://…" />
        </label>
      </div>
      <label className="field">
        <span>Telegram (optional)</span>
        <input name="telegram" placeholder="https://t.me/…" />
      </label>

      {error && <p className="notice error">{error}</p>}
      {step && <p className="notice">{step}</p>}
      {launch?.status === "submitted" && <p className="notice">Launching on {launchpad}… this takes a few seconds.</p>}
      {launch?.status === "failed" && <p className="notice error">{launch.error ?? "The launch failed."}</p>}

      <button className="btn" type="submit" disabled={busy || !wallet}>
        {busy ? "Working…" : wallet ? `Launch on ${launchpad}` : "Connect a wallet to launch"}
      </button>
      <p className="muted" style={{ fontSize: 13 }}>
        You pay {launchpad}&apos;s own launch fee from your wallet; {ownHandle ? `@${ownHandle}` : "this site"} adds nothing on top.
        Your wallet shows the exact amount before you approve.
      </p>
    </form>
  );
}
