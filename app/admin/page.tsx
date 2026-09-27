import { redirect } from "next/navigation";
import Link from "next/link";
import { config } from "@/lib/config.ts";
import { isAdmin } from "@/lib/admin.ts";
import { formatUsd } from "@/lib/money.ts";
import { listDetected } from "@/lib/queries.ts";
import { detectionEnabled } from "@/lib/detect.ts";
import { getAccount, getStats, listLinkRequests, listPayouts, listTokens, pendingBurnMicros, recentClaims } from "@/lib/queries.ts";
import { db, payoutProvider } from "@/lib/server.ts";
import { Erc20PayoutProvider } from "@/lib/payouts/erc20.ts";
import { shortAddr, timeAgo } from "@/components/Tables.tsx";
import { CopyButton } from "@/components/CopyButton.tsx";

export const dynamic = "force-dynamic";

function TxLink({ hash }: { hash: string | null }) {
  if (!hash) return <span className="muted">—</span>;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return <span className="mono">{hash}</span>;
  return config.explorerTxUrl ? (
    <a className="mono" href={config.explorerTxUrl.replace("{hash}", hash)} target="_blank" rel="noreferrer">
      {shortAddr(hash)}
    </a>
  ) : (
    <span className="mono">{shortAddr(hash)}</span>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { msg, err } = await searchParams;
  const d = db();
  const stats = getStats(d);
  const tokens = listTokens(d, { limit: 200, sort: "new" });
  const queued = d
    .prepare(
      `SELECT p.*, a.wallet FROM payouts p LEFT JOIN accounts a ON a.handle = p.handle
       WHERE p.status = 'queued' ORDER BY p.id`,
    )
    .all() as (ReturnType<typeof listPayouts>[number] & { wallet: string | null })[];
  const recentPayouts = listPayouts(d, { limit: 15 }).filter((p) => p.status !== "queued");
  const burnPending = pendingBurnMicros(d);
  const links = listLinkRequests(d, { status: "pending", limit: 100 });
  const needHandle = listDetected(d, "needs_handle", 100);
  const recentDetected = listDetected(d, undefined, 10);

  let provider = config.payoutProvider as string;
  let walletInfo: string | null = null;
  try {
    const p = payoutProvider();
    provider = p.name;
    if (p instanceof Erc20PayoutProvider) {
      walletInfo = `Payout wallet ${shortAddr(p.address)}: ${formatUsd(await p.balanceMicros())} available`;
    }
  } catch (e) {
    walletInfo = `Payout provider not ready: ${(e as Error).message}`;
  }

  return (
    <div className="admin">
      <div className="admin-head">
        <h1>Admin</h1>
        <form action="/api/admin/logout" method="post">
          <button className="btn btn-ghost btn-small" type="submit">
            Sign out
          </button>
        </form>
      </div>
      {msg && <p className="notice ok">{msg}</p>}
      {err && <p className="notice error">{err}</p>}

      <div className="stats">
        <div className="stat">
          <div className="label">Fees recorded</div>
          <div className="value">{formatUsd(stats.claimedMicros)}</div>
        </div>
        <div className="stat">
          <div className="label">Paid out</div>
          <div className="value">{formatUsd(stats.paidMicros)}</div>
        </div>
        <div className="stat">
          <div className="label">Queued payouts</div>
          <div className="value">{formatUsd(queued.reduce((s, p) => s + p.amount_micros, 0))}</div>
          <div className="sub">{queued.length} payout(s)</div>
        </div>
        <div className="stat">
          <div className="label">Burn owed</div>
          <div className="value">{formatUsd(burnPending)}</div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -12 }}>
        Payouts: <strong>{provider === "xmoney" ? "X Money (sent from the queue below)" : provider}</strong>
        {walletInfo ? ` · ${walletInfo}` : ""}
      </p>

      <div className="admin-grid">
        <section className="panel">
          <h2>1. Record a claim</h2>
          <p className="muted">
            Claim the token's creator fees on long.xyz from the treasury, then record it here. The split, milestones and payouts run
            automatically.
          </p>
          {tokens.length === 0 ? (
            <p className="notice">Add a token first.</p>
          ) : (
            <form action="/api/admin/action" method="post" className="stack">
              <input type="hidden" name="action" value="record-claim" />
              <label className="field">
                <span>Token</span>
                <select name="token" required defaultValue="">
                  <option value="" disabled>
                    Choose a token
                  </option>
                  {tokens.map((t) => (
                    <option key={t.address} value={t.address}>
                      ${t.symbol} → @{t.handle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Amount claimed (USD value)</span>
                <input name="amount" inputMode="decimal" placeholder="125.40" required />
              </label>
              <label className="field">
                <span>Claim transaction hash</span>
                <input name="tx" placeholder="0x…" required pattern="0x[0-9a-fA-F]{64}" />
              </label>
              <label className="field">
                <span>Note (optional)</span>
                <input name="note" placeholder="e.g. 0.42 NVDA @ $298.50" />
              </label>
              <button className="btn" type="submit">
                Record claim and distribute
              </button>
            </form>
          )}
        </section>

        <section className="panel">
          <h2>2. Add or update a token</h2>
          <p className="muted">
            Only add tokens whose creator-fee beneficiary is the treasury. {config.long.rpcUrl ? "Name and symbol are read from chain if left empty." : ""}
          </p>
          <form action="/api/admin/action" method="post" className="stack">
            <input type="hidden" name="action" value="add-token" />
            <label className="field">
              <span>Token address</span>
              <input name="address" placeholder="0x…" required pattern="0x[0-9a-fA-F]{40}" />
            </label>
            <label className="field">
              <span>X handle that gets the fees</span>
              <input name="handle" placeholder="@handle" required />
            </label>
            <div className="row2">
              <label className="field">
                <span>Name</span>
                <input name="name" placeholder={config.long.rpcUrl ? "(from chain)" : "Moon Nvidia"} required={!config.long.rpcUrl} />
              </label>
              <label className="field">
                <span>Symbol</span>
                <input name="symbol" placeholder={config.long.rpcUrl ? "(from chain)" : "MOON"} required={!config.long.rpcUrl} />
              </label>
            </div>
            <button className="btn" type="submit">
              Save token
            </button>
          </form>
        </section>
      </div>

      <section>
        <div className="admin-head">
          <h2>Launches on app.long.xyz</h2>
          <form action="/api/admin/action" method="post">
            <input type="hidden" name="action" value="sync-launches" />
            <button className="btn btn-small" type="submit" disabled={!detectionEnabled()}>
              Sync now
            </button>
          </form>
        </div>
        {!detectionEnabled() ? (
          <p className="notice">
            Set LONGPAID_FEE_WALLETS to the wallet long.xyz pays {config.detect.handle ? `@${config.detect.handle}` : "LongPaid's X account"}
            {" "}to, then launches that send fees to it are found automatically.
          </p>
        ) : (
          <p className="muted" style={{ fontSize: 14 }}>
            Found automatically every {Math.round(config.detect.intervalMs / 60_000) || "few"} min: launches whose fee receiver is{" "}
            {config.detect.handle ? `@${config.detect.handle}` : "LongPaid"} ({config.detect.feeWallets.map((w) => shortAddr(w)).join(", ")}). A bio with
            &quot;fees @handle&quot; registers the token on its own; the rest wait here.
          </p>
        )}
        {needHandle.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Why</th>
                  <th>Launch tx</th>
                  <th>Assign handle</th>
                </tr>
              </thead>
              <tbody>
                {needHandle.map((l) => (
                  <tr key={l.asset}>
                    <td>
                      <strong>${l.symbol}</strong> <span className="muted">{l.name}</span>
                      <div className="mono muted">{shortAddr(l.asset)}</div>
                    </td>
                    <td className="muted">{l.note}</td>
                    <td>
                      <TxLink hash={l.tx_hash} />
                    </td>
                    <td>
                      <form action="/api/admin/action" method="post" className="inline">
                        <input type="hidden" name="asset" value={l.asset} />
                        <input name="handle" placeholder="@handle" />
                        <button className="btn btn-small" type="submit" name="action" value="assign-handle">
                          Register
                        </button>
                        <button className="btn btn-ghost btn-small" type="submit" name="action" value="dismiss-launch" formNoValidate>
                          Dismiss
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recentDetected.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Fees to</th>
                  <th>Status</th>
                  <th>Launched</th>
                </tr>
              </thead>
              <tbody>
                {recentDetected.map((l) => (
                  <tr key={l.asset}>
                    <td>
                      <Link href={`/token/${l.asset}`}>${l.symbol}</Link> <span className="muted">{l.name}</span>
                    </td>
                    <td>{l.handle ? <Link href={`/profile/${l.handle}`}>@{l.handle}</Link> : <span className="muted">—</span>}</td>
                    <td>
                      <span className={`pill ${l.status === "registered" ? "paid" : l.status === "needs_handle" ? "failed" : ""}`}>{l.status.replace("_", " ")}</span>
                    </td>
                    <td className="muted">{timeAgo(l.launched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          detectionEnabled() && <div className="empty">No launches routed to LongPaid yet.</div>
        )}
      </section>

      <section>
        <h2>Wallet link requests</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          The signature already proves the wallet. Open the post and approve only if it was made by the same X account and shows
          the same code. Post links work with any name in the path, so check the author on X, not just the URL.
        </p>
        {links.length === 0 ? (
          <div className="empty">No pending requests.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>X account</th>
                  <th>Wallet</th>
                  <th>Code</th>
                  <th>Post</th>
                  <th>Replaces</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const current = getAccount(d, l.handle)?.wallet;
                  return (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/profile/${l.handle}`}>@{l.handle}</Link>
                        <div className="muted" style={{ fontSize: 12 }}>{timeAgo(l.created_at)}</div>
                      </td>
                      <td className="mono">{shortAddr(l.wallet)}</td>
                      <td className="mono">{l.code}</td>
                      <td>
                        <a href={l.tweet_url} target="_blank" rel="noreferrer">
                          Open post
                        </a>
                      </td>
                      <td className="mono muted">{current ? shortAddr(current) : "—"}</td>
                      <td>
                        <form action="/api/admin/action" method="post" className="inline">
                          <input type="hidden" name="id" value={l.id} />
                          <button className="btn btn-small" type="submit" name="action" value="link-approve">
                            Approve
                          </button>
                          <button className="btn btn-ghost btn-small" type="submit" name="action" value="link-reject">
                            Reject
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {config.payoutProvider === "xmoney" ? (
      <section>
        <div className="admin-head">
          <h2>Send on X Money</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {queued.length} to send · {formatUsd(queued.reduce((t, p) => t + p.amount_micros, 0))} total
          </span>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>
          Payouts queue here automatically when an account crosses a milestone. Send each one from {config.appName}&apos;s X Money
          balance to the @handle in the X app (Wallet → Send), then click Sent. If the account can&apos;t receive X Money, click
          Can&apos;t pay: the amount goes back to its balance and is sent with the next milestone.
        </p>
        {queued.length === 0 ? (
          <div className="empty">Nothing to send.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Send to</th>
                  <th className="num">Amount</th>
                  <th>Queued</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queued.map((p) => (
                  <tr key={p.id}>
                    <td className="mono muted">{p.id}</td>
                    <td>
                      <div className="inline-copy">
                        <a href={`https://x.com/${p.handle}`} target="_blank" rel="noreferrer">
                          <strong>@{p.handle}</strong>
                        </a>
                        <CopyButton text={p.handle} label="Copy" />
                      </div>
                    </td>
                    <td className="num">
                      <div className="inline-copy" style={{ justifyContent: "flex-end" }}>
                        <strong>{formatUsd(p.amount_micros)}</strong>
                        <CopyButton text={(p.amount_micros / 1_000_000).toFixed(2)} label="Copy" />
                      </div>
                    </td>
                    <td className="muted">{timeAgo(p.created_at)}</td>
                    <td>
                      <form action="/api/admin/action" method="post" className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <input name="ref" placeholder="note (optional)" />
                        <button className="btn btn-small" type="submit" name="action" value="mark-paid">
                          Sent
                        </button>
                        <button className="btn btn-ghost btn-small" type="submit" name="action" value="mark-failed">
                          Can&apos;t pay
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : (
      <section>
        <div className="admin-head">
          <h2>Queued payouts</h2>
          <form action="/api/admin/action" method="post">
            <input type="hidden" name="action" value="distribute" />
            <button className="btn btn-small" type="submit">
              Distribute now
            </button>
          </form>
        </div>
        {queued.length === 0 ? (
          <div className="empty">Nothing queued.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Account</th>
                  <th className="num">Amount</th>
                  <th>State</th>
                  <th>Settle by hand</th>
                </tr>
              </thead>
              <tbody>
                {queued.map((p) => {
                  const inFlight = p.attempted_at !== null;
                  return (
                    <tr key={p.id}>
                      <td className="mono muted">{p.id}</td>
                      <td>
                        <Link href={`/profile/${p.handle}`}>@{p.handle}</Link>
                        <div className="mono muted">{p.wallet ? shortAddr(p.wallet) : "no wallet"}</div>
                      </td>
                      <td className="num">{formatUsd(p.amount_micros)}</td>
                      <td>
                        {inFlight ? (
                          <>
                            <span className="pill failed">check on chain</span>
                            <div className="muted" style={{ fontSize: 12 }}>
                              sent? <TxLink hash={p.attempt_ref} />
                            </div>
                            <form action="/api/admin/action" method="post" style={{ marginTop: 4 }}>
                              <input type="hidden" name="action" value="reset-attempt" />
                              <input type="hidden" name="id" value={p.id} />
                              <button className="btn btn-ghost btn-small" type="submit">
                                Not sent, retry
                              </button>
                            </form>
                          </>
                        ) : (
                          <span className="pill">{p.wallet || provider !== "erc20" ? "queued" : "waiting for wallet"}</span>
                        )}
                      </td>
                      <td>
                        <form action="/api/admin/action" method="post" className="inline">
                          <input type="hidden" name="action" value="mark-paid" />
                          <input type="hidden" name="id" value={p.id} />
                          <input name="ref" placeholder="tx / ref" defaultValue={p.attempt_ref ?? ""} />
                          <button className="btn btn-small" type="submit">
                            Paid
                          </button>
                        </form>
                        <form action="/api/admin/action" method="post" className="inline" style={{ marginTop: 4 }}>
                          <input type="hidden" name="action" value="mark-failed" />
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn btn-ghost btn-small" type="submit">
                            Failed
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      <div className="admin-grid">
        <section className="panel">
          <h2>Buyback and burn</h2>
          <p>
            Owed: <strong>{formatUsd(burnPending)}</strong>. After buying back and burning, record the transaction.
          </p>
          <form action="/api/admin/action" method="post" className="inline">
            <input type="hidden" name="action" value="burns-done" />
            <input name="tx" placeholder="0x… burn tx" required pattern="0x[0-9a-fA-F]{64}" />
            <button className="btn btn-small" type="submit" disabled={burnPending === 0}>
              Mark burned
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Opt-out</h2>
          <form action="/api/admin/action" method="post" className="inline">
            <input type="hidden" name="action" value="opt-out" />
            <input name="handle" placeholder="@handle" required />
            <select name="value" defaultValue="1">
              <option value="1">Opt out</option>
              <option value="0">Opt back in</option>
            </select>
            <button className="btn btn-small" type="submit">
              Save
            </button>
          </form>
        </section>
      </div>

      <section>
        <h2>Recent claims</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>To</th>
                <th className="num">Amount</th>
                <th>Tx</th>
                <th>Note</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentClaims(d, { limit: 20 }).map((c) => (
                <tr key={c.id}>
                  <td>${c.symbol}</td>
                  <td>@{c.handle}</td>
                  <td className="num">{formatUsd(c.amount_micros)}</td>
                  <td>
                    <TxLink hash={c.tx_hash} />
                  </td>
                  <td className="muted">{c.note ?? ""}</td>
                  <td className="muted">{timeAgo(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Recent settled payouts</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>
              {recentPayouts.map((p) => (
                <tr key={p.id}>
                  <td className="mono muted">{p.id}</td>
                  <td>@{p.handle}</td>
                  <td className="num">{formatUsd(p.amount_micros)}</td>
                  <td>
                    <span className={`pill ${p.status}`}>{p.status}</span>
                  </td>
                  <td>
                    <TxLink hash={p.provider_ref} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
