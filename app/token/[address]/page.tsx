import Link from "next/link";
import { notFound } from "next/navigation";
import { formatUsd } from "@/lib/money.ts";
import { getToken, recentClaims, tokenTotals } from "@/lib/queries.ts";
import { db } from "@/lib/server.ts";
import { ClaimsTable } from "@/components/Tables.tsx";

export const dynamic = "force-dynamic";

export default async function Token({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) notFound();
  const d = db();
  const token = getToken(d, address);

  if (!token) {
    return (
      <div className="profile-head" style={{ display: "block" }}>
        <h1>Token not found</h1>
        <p className="muted mono">{address}</p>
        <p className="notice">
          This token isn't routing fees through us yet. Tokens appear once their creator-fee beneficiary is our treasury,
          their metadata names an X handle, and the team has added them.{" "}
          <Link href={`/check?address=${address}`}>Check this token</Link> or read the <Link href="/launch">launch guide</Link>.
        </p>
      </div>
    );
  }

  const claims = recentClaims(d, { token: token.address, limit: 50 });
  const totals = tokenTotals(d, token.address);

  return (
    <>
      <div className="profile-head">
        <div className="avatar">{token.image ? <img src={token.image} alt="" /> : token.symbol[0]}</div>
        <div>
          <h1>
            ${token.symbol} <span className="muted" style={{ fontWeight: 400 }}>{token.name}</span>
          </h1>
          <div className="mono muted">{token.address}</div>
        </div>
      </div>
      <p>
        Creator fees go to <Link href={`/profile/${token.handle}`}>@{token.handle}</Link>.
      </p>
      <div className="stats">
        <div className="stat">
          <div className="label">Fees claimed</div>
          <div className="value">{formatUsd(token.fees_micros)}</div>
        </div>
        <div className="stat">
          <div className="label">To @{token.handle}</div>
          <div className="value">{formatUsd(totals.recipient)}</div>
        </div>
        <div className="stat">
          <div className="label">Burned</div>
          <div className="value">{formatUsd(totals.burn)}</div>
        </div>
        <div className="stat">
          <div className="label">Claims</div>
          <div className="value">{totals.claims}</div>
        </div>
      </div>
      <section>
        <h2>Claims</h2>
        <ClaimsTable rows={claims} showHandle={false} />
      </section>
    </>
  );
}
