"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { appName, chain } from "@/lib/chain.ts";
import { linkMessage, tweetText, verificationCode } from "@/lib/walletlink.ts";
import { short, useWallet } from "./WalletProvider.tsx";

type Status = {
  accounts: { handle: string; lifetimeMicros: number; paidMicros: number; balanceMicros: number; queuedMicros: number; optedOut: boolean }[];
  requests: { id: number; handle: string; code: string; status: "pending" | "approved" | "rejected"; createdAt: number }[];
};

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const usd = (m: number) => (m / 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" });
const clean = (s: string) => {
  const t = s.trim();
  const url = t.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([^/?#\s]+)/i);
  return (url ? url[1] : t).replace(/^@/, "");
};

/** Connect wallet → sign → post the code from X → submit. An admin approves, then payouts are automatic. */
export function WalletLinker() {
  const w = useWallet();
  const [status, setStatus] = useState<Status | null>(null);
  const [handleRaw, setHandleRaw] = useState("");
  const [signed, setSigned] = useState<{ handle: string; issuedAt: string; signature: string; code: string } | null>(null);
  const [tweetUrl, setTweetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!w.address) return setStatus(null);
    const res = await fetch(`/api/wallet/${w.address}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setStatus(await res.json());
  }, [w.address]);

  useEffect(() => {
    load();
    setSigned(null);
    setDone(null);
  }, [load]);

  const handle = clean(handleRaw);
  const handleOk = HANDLE_RE.test(handle);

  async function sign() {
    if (!w.address || !handleOk) return;
    setBusy(true);
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      const message = linkMessage({ appName, handle: handle.toLowerCase(), wallet: w.address, chainId: chain.id, issuedAt });
      const signature = await w.signMessage(message);
      setSigned({ handle: handle.toLowerCase(), issuedAt, signature, code: verificationCode(signature) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!signed || !w.address) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...signed, wallet: w.address, tweetUrl }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't submit.");
      setDone(`Submitted. Once the team confirms your post, payouts for @${signed.handle} go to ${short(w.address)} automatically.`);
      setSigned(null);
      setTweetUrl("");
      setHandleRaw("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!w.address) {
    return (
      <div className="panel">
        <h2>Connect your wallet</h2>
        <p className="muted">
          Payouts are sent on {chain.name}. Connect the wallet you want to receive them with.
        </p>
        <button className="btn" type="button" onClick={w.connect} disabled={w.connecting}>
          {w.connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {w.error && <p className="field-error">{w.error}</p>}
      </div>
    );
  }

  if (!w.onRightChain) {
    return (
      <div className="panel">
        <h2>Switch network</h2>
        <p className="muted">Your wallet is on another network. Switch to {chain.name} (chain ID {chain.id}).</p>
        <button className="btn" type="button" onClick={w.switchChain}>
          Switch to {chain.name}
        </button>
        {w.error && <p className="field-error">{w.error}</p>}
      </div>
    );
  }

  const intent = signed ? `https://x.com/intent/post?text=${encodeURIComponent(tweetText(signed.code, appName))}` : "";

  return (
    <>
      <div className="panel">
        <div className="copy-label">Connected on {chain.name}</div>
        <div className="mono" style={{ wordBreak: "break-all" }}>
          {w.address}
        </div>
      </div>

      {status && status.accounts.length > 0 && (
        <section>
          <h2>Payouts to this wallet</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>X account</th>
                  <th className="num">Earned</th>
                  <th className="num">Paid out</th>
                  <th className="num">Sending / waiting</th>
                </tr>
              </thead>
              <tbody>
                {status.accounts.map((a) => (
                  <tr key={a.handle}>
                    <td>
                      <Link href={`/profile/${a.handle}`}>@{a.handle}</Link>
                      {a.optedOut && <span className="pill failed" style={{ marginLeft: 8 }}>opted out</span>}
                    </td>
                    <td className="num">{usd(a.lifetimeMicros)}</td>
                    <td className="num">{usd(a.paidMicros)}</td>
                    <td className="num">{usd(a.queuedMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2>Link an X account</h2>
        <p className="muted">
          Tokens send fees to an X handle. To receive that handle's payouts here, prove you own both the wallet and the X account.
        </p>
        {done && <p className="notice ok">{done}</p>}

        <ol className="guide">
          <li>
            <h3>Sign with your wallet</h3>
            <label className="field">
              <span>Your X handle</span>
              <input value={handleRaw} onChange={(e) => setHandleRaw(e.target.value)} placeholder="@handle" disabled={Boolean(signed)} />
            </label>
            {handleRaw && !handleOk && <p className="field-error">1–15 letters, numbers or underscores.</p>}
            <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
              Signing is free and doesn't send a transaction.
            </p>
            {!signed ? (
              <button className="btn" type="button" onClick={sign} disabled={!handleOk || busy}>
                {busy ? "Waiting for wallet…" : "Sign message"}
              </button>
            ) : (
              <p className="notice ok">Signed for @{signed.handle}.</p>
            )}
          </li>
          <li>
            <h3>Post your code from @{signed?.handle ?? "your account"}</h3>
            {signed ? (
              <>
                <div className="copy-row">
                  <code>{tweetText(signed.code, appName)}</code>
                </div>
                <a className="btn" href={intent} target="_blank" rel="noreferrer">
                  Post on X
                </a>
              </>
            ) : (
              <p className="muted">Sign first to get your code.</p>
            )}
          </li>
          <li>
            <h3>Paste the link to your post</h3>
            <label className="field">
              <span>Post URL</span>
              <input
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder={`https://x.com/${signed?.handle ?? "handle"}/status/…`}
                disabled={!signed}
              />
            </label>
            <button className="btn" type="button" onClick={submit} disabled={!signed || !tweetUrl || busy} style={{ marginTop: 10 }}>
              {busy && signed ? "Submitting…" : "Submit for review"}
            </button>
          </li>
        </ol>
        {error && <p className="notice error">{error}</p>}
      </section>

      {status && status.requests.length > 0 && (
        <section>
          <h2>Your requests</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>X account</th>
                  <th>Code</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {status.requests.map((r) => (
                  <tr key={r.id}>
                    <td>@{r.handle}</td>
                    <td className="mono">{r.code}</td>
                    <td>
                      <span className={`pill ${r.status === "approved" ? "paid" : r.status === "rejected" ? "failed" : ""}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
