/**
 * Redirect with a relative Location, so the browser stays on whatever domain it used. Behind a proxy (Railway),
 * the server's own URL is an internal host like localhost:8080, and absolute redirects built from it break.
 */
export function redirectTo(path: string, status = 303): Response {
  return new Response(null, { status, headers: { location: path } });
}

/** The public host the browser used: the proxy's forwarded host, else the Host header. */
export function requestHost(req: Request): string | null {
  return (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0].trim().toLowerCase() ?? null;
}

/** True when the request reached us over HTTPS (directly or through the proxy). */
export function isHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return proto ? proto === "https" : new URL(req.url).protocol === "https:";
}
