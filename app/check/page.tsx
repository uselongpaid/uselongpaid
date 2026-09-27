import Link from "next/link";
import { formatUsd } from "@/lib/money.ts";
import { getDetected, getToken } from "@/lib/queries.ts";
import { config } from "@/lib/config.ts";
import { db, feeSource } from "@/lib/server.ts";
import type { Inspection } from "@/lib/sources/types.ts";
import { isTokenAddress } from "@/lib/address.ts";

export const dynamic = "force-dynamic";

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
  const valid = isTokenAddress(address);

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
  const detected = valid ? getDetected(db(), address) : null;
  const handle = tracked?.handle ?? detected?.handle ?? inspection?.handle ?? null;
  const handleLabel = config.detect.handle ? `@${config.detect.handle}` : config.appName;

  return (
    <div className="docs">
      <h1>Eligibility checker</h1>
      <p className="muted">Paste a {config.launchpad.name} token address to see whether its fees reach an X account.</p>
      <form className="lookup" action="/check" method="get" style={{ marginTop: 20 }}>
        <input name="address" defaultValue={address} placeholder="Token mint address" aria-label="Token address" autoComplete="off" required />
        <button className="btn" type="submit">
          Check
        </button>
      </form>

      {address && !valid && <p className="notice error">That isn't a token address. Paste the token's mint address.</p>}
      {error && <p className="notice error">Couldn't read the chain: {error}</p>}

      {valid && inspection && (
        <>
          <h2>
            {inspection.symbol ? `$${inspection.symbol}` : "Token"}{" "}
            <span className="muted" style={{ fontWeight: 400 }}>{inspection.name}</span>
          </h2>
          <ul className="checks">
            <Row
              ok={inspection.exists ?? (tracked || detected ? true : null)}
              title="Token found on chain"
              detail={
                inspection.exists === null
                  ? tracked || detected
                    ? "Seen on chain by LongPaid."
                    : "Not checked."
                  : inspection.exists
                    ? "We can read this token."
                    : "Nothing readable at this address on the configured chain."
              }
            />
            <Row
              ok={detected ? true : tracked ? true : null}
              title={`Creator fees go to ${config.appName}`}
              detail={
                detected
                  ? "Confirmed in the launch transaction."
                  : tracked
                    ? "Added by the team."
                    : `Not added yet. Tag ${handleLabel} on X with the token address and the team adds it.`
              }
            />
            <Row
              ok={handle ? true : detected?.status === "needs_handle" ? false : null}
              title="Bio says who earns the fees"
              detail={
                handle ? (
                  <Link href={`/profile/${handle}`}>@{handle}</Link>
                ) : detected?.status === "needs_handle" ? (
                  "No “fees @handle” found in the bio. The team can assign it by hand."
                ) : (
                  "Write “fees @handle” in the token bio."
                )
              }
            />
            <Row
              ok={Boolean(tracked)}
              title="Earning on LongPaid"
              detail={
                tracked ? (
                  <Link href={`/token/${tracked.address}`}>{formatUsd(tracked.fees_micros)} claimed so far</Link>
                ) : detected?.status === "pending" ? (
                  "Found; reading its metadata."
                ) : (
                  "Not yet."
                )
              }
            />
          </ul>
          {!tracked && !detected ? (
            <p className="notice">
              This token isn't set up yet. Follow the <Link href="/launch">launch guide</Link>.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
