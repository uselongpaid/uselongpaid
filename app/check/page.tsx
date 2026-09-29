import Link from "next/link";
import { formatUsd } from "@/lib/money.ts";
import { getDetected, getToken } from "@/lib/queries.ts";
import { config } from "@/lib/config.ts";
import { db, feeSource } from "@/lib/server.ts";
import { resolveDetected } from "@/lib/detect.ts";
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
  // A launch we've seen but whose metadata isn't read yet: read it now rather than wait for the next scan.
  const seen = valid ? await getDetected((await db()), address) : null;
  if (seen && (seen.status === "pending" || seen.note === "metadata unreachable")) await resolveDetected(address).catch(() => null);
  const tracked = valid ? await getToken((await db()), address) : null;
  const detected = valid ? await getDetected((await db()), address) : null;
  const handle = tracked?.handle ?? detected?.handle ?? inspection?.handle ?? null;
  const handleLabel = config.detect.handle ? `@${config.detect.handle}` : config.appName;

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
              ok={inspection.exists ?? (tracked || detected ? true : null)}
              title="Token contract found"
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
              title={`Fees sent to ${handleLabel}`}
              detail={
                detected
                  ? "Confirmed in the launch transaction on long.xyz."
                  : tracked
                    ? "Added by the team."
                    : `Not seen yet. New launches are picked up within a few minutes if their fee receiver is ${handleLabel}.`
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
                  `Found, but its metadata couldn't be read yet (try ${detected.attempts ?? 0} of 5). It's retried every few minutes; reload to try now.`
                ) : detected?.status === "needs_handle" ? (
                  "Waiting for the team to confirm the handle."
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
