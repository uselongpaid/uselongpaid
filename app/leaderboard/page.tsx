import Link from "next/link";
import { formatUsd } from "@/lib/money.ts";
import { listTokens, topAccounts } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";
import { TokensTable } from "@/components/Tables.tsx";

export const dynamic = "force-dynamic";

export default async function Leaderboard() {
  const d = await db();
  const accounts = await topAccounts(d, 50);
  return (
    <>
      <div className="hero" style={{ paddingBottom: 0 }}>
        <h1>Leaderboard</h1>
      </div>
      <section style={{ marginTop: 16 }}>
        <h2>Top earning accounts</h2>
        {accounts.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Account</th>
                  <th className="num">Earned</th>
                  <th className="num">Paid out</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => (
                  <tr key={a.handle}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <Link href={`/profile/${a.handle}`}>@{a.handle}</Link>
                    </td>
                    <td className="num">{formatUsd(a.lifetime_micros)}</td>
                    <td className="num">{formatUsd(a.paid_micros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">No earnings yet.</div>
        )}
      </section>
      <section>
        <h2>Top tokens</h2>
        <TokensTable rows={await listTokens(d, { limit: 50 })} />
      </section>
    </>
  );
}
