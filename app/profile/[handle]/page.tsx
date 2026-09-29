import { notFound } from "next/navigation";
import { config } from "@/lib/config.ts";
import { normalizeHandle } from "@/lib/handle.ts";
import { formatUsd } from "@/lib/money.ts";
import { nextMilestone } from "@/lib/milestones.ts";
import { earningsByToken, getAccount, listPayouts, recentClaims } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";
import Link from "next/link";
import { ClaimsTable, PayoutsTable, shortAddr } from "@/components/Tables.tsx";
import { Avatar } from "@/components/Avatar.tsx";

export const dynamic = "force-dynamic";

export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const handle = normalizeHandle(decodeURIComponent((await params).handle));
  if (!handle) notFound();

  const d = await db();
  const account = await getAccount(d, handle);
  const earnings = await earningsByToken(d, handle);
  const next = nextMilestone(account?.milestone_micros ?? 0, config.milestones);
  const toMilestone = Math.max(0, next - (account?.lifetime_micros ?? 0));

  return (
    <>
      <div className="profile-head">
        <Avatar handle={handle} />
        <div>
          <h1>@{handle}</h1>
          <a className="muted" href={`https://x.com/${handle}`} target="_blank" rel="noreferrer">
            x.com/{handle}
          </a>
        </div>
      </div>

      {account?.opted_out ? (
        <p className="notice">This account opted out. Fees from its tokens are burned instead of paid out.</p>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="label">Lifetime earned</div>
          <div className="value">{formatUsd(account?.lifetime_micros ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="label">Paid out</div>
          <div className="value">{formatUsd(account?.paid_micros ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="label">Balance</div>
          <div className="value">{formatUsd(account?.balance_micros ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="label">Until next payout</div>
          <div className="value">{formatUsd(toMilestone)}</div>
          <div className="sub">at {formatUsd(next)} earned</div>
        </div>
      </div>

      {!account && (
        <p className="notice">
          No tokens route fees to @{handle} yet. Launch one on long.xyz with this handle in its metadata and it will show up
          here once the team adds it.
        </p>
      )}

      <section>
        <h2>Earnings by token</h2>
        {earnings.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Address</th>
                  <th className="num">Claims</th>
                  <th className="num">Earned</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((t) => (
                  <tr key={t.address}>
                    <td>
                      <Link href={`/token/${t.address}`}>
                        <strong>${t.symbol}</strong> <span className="muted">{t.name}</span>
                      </Link>
                    </td>
                    <td className="mono muted">{shortAddr(t.address)}</td>
                    <td className="num">{t.claims}</td>
                    <td className="num">{formatUsd(t.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No tokens yet.</div>
        )}
      </section>
      <section>
        <h2>Payouts</h2>
        <PayoutsTable rows={await listPayouts(d, { handle, limit: 20 })} />
      </section>
      <section>
        <h2>Claims</h2>
        <ClaimsTable rows={await recentClaims(d, { handle, limit: 20 })} showHandle={false} />
      </section>
    </>
  );
}
