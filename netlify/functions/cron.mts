// Netlify scheduled function: the serverless stand-in for the background loop a long-running server would run.
// Every 2 minutes it scans long.xyz for new launches routed to LongPaid, then hands out any queued payouts.
// Needs CRON_SECRET (the same value the app uses); Netlify provides URL, the site's address.

export default async function cron(): Promise<Response> {
  const base = (process.env.URL || process.env.APP_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET || "";
  if (!base || !secret) {
    console.error("[cron] URL and CRON_SECRET must be set");
    return new Response("not configured", { status: 500 });
  }
  const results: Record<string, string> = {};
  for (const path of ["/api/cron/sync-launches", "/api/cron/distribute"]) {
    try {
      const r = await fetch(base + path, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12_000) });
      results[path] = `${r.status} ${(await r.text()).slice(0, 300)}`;
    } catch (e) {
      results[path] = `error: ${(e as Error).message}`;
    }
  }
  console.log("[cron]", JSON.stringify(results));
  return new Response(JSON.stringify(results), { headers: { "content-type": "application/json" } });
}

export const config = { schedule: "*/2 * * * *" };
