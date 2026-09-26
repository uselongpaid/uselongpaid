import Link from "next/link";
import { formatUsd } from "@/lib/money.ts";
import { getToken } from "@/lib/queries.ts";
import { db, feeSource } from "@/lib/server.ts";
import type { Inspection } from "@/lib/sources/types.ts";

export const dynamic = "force-dynamic";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function Row({ ok, title, detail }: { ok: boolean | null; title: string; detail: React.ReactNode }) {
  const mark = ok === null ? "–" : ok ? "✓" : "✕";
  return (
    <li className={ok === null ? "check unknown" : ok ? "check pass" : "check fail"}>
      <span className="mark" aria-label={ok === null ? "unknown" : ok ? "pass" : "fail"}>
        {mark}
      </span>
      <div>
        <strong>{title}</strong>
        <div className="muted">{detail}</div>
      </div>
    </li>
  );
}

export default async function Check({ searchParams }: { searchParams: Promise<{ address?: string }> }) {
  const address = ((await searchParams).address ?? "").trim();
  const valid = ADDR_RE.test(address);

  let inspection: Inspection | null = null;
  let error: string | null = null;
  if (valid) {
    try {
      inspection = await feeSource().inspect(address);
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const tracked = valid ? getToken(db(), address) : null;
  const handle = tracked?.handle ?? inspection?.handle ?? null;

  return (
    <div className="docs">
      <h1>Eligibility checker</h1>
      <p className="muted">Paste a long.xyz token address to see whether its fees reach an X account.</p>
      <form className="lookup" action="/check" method="get" style={{ marginTop: 20 }}>
        <input name="address" defaultValue={address} placeholder="0x…" aria-label="Token address" autoComplete="off" required />
        <button className="btn" type="submit">
          Check
        </button>
      </form>

      {address && !valid && <p className="notice error">That isn't a token address. It should be 0x followed by 40 hex characters.</p>}
      {error && <p className="notice error">Couldn't read the chain: {error}</p>}

      {valid && inspection && (
        <>
          <h2>
            {inspection.symbol ? `$${inspection.symbol}` : "Token"}{" "}
            <span className="muted" style={{ fontWeight: 400 }}>{inspection.name}</span>
          </h2>
          <ul className="checks">
            <Row
              ok={inspection.exists ?? (tracked ? true : null)}
              title="Token contract found"
              detail={
                inspection.exists === null
                  ? tracked
                    ? "Registered by the team."
                    : "Not checked."
                  : inspection.exists
                    ? "We can read this token."
                    : "Nothing readable at this address on the configured chain."
              }
            />
            <Row
              ok={inspection.routesToTreasury ?? (tracked ? true : null)}
              title="Creator fees go to our treasury"
              detail={
                inspection.routesToTreasury === null
                  ? tracked
                    ? "Confirmed by the team when the token was added."
                    : "Checked by the team when they add the token."
                  : inspection.routesToTreasury
                    ? `Pending fees: ${inspection.pendingMicros === null ? "unknown" : formatUsd(inspection.pendingMicros)}`
                    : "The fee beneficiary isn't our treasury, so we can't claim for it."
              }
            />
            <Row
              ok={handle ? true : null}
              title="X handle in metadata"
              detail={handle ? <Link href={`/profile/${handle}`}>@{handle}</Link> : "No handle found. Add feeRecipient, x or twitter to the metadata."}
            />
            <Row
              ok={Boolean(tracked)}
              title="Picked up by the claimer"
              detail={tracked ? <Link href={`/token/${tracked.address}`}>{formatUsd(tracked.fees_micros)} claimed so far</Link> : "Not yet. The team adds new tokens after checking their fee setup."}
            />
          </ul>
          {inspection.routesToTreasury === false || (!handle && !tracked) ? (
            <p className="notice">
              This token isn't set up yet. Follow the <Link href="/launch">launch guide</Link>.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
