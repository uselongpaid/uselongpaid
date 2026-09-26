import { config } from "./config.ts";
import { requestHost } from "./http.ts";

/**
 * Rejects cross-site form posts. The Origin header, when present, must be this site: the host the request was
 * sent to, or APP_URL.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  return host === requestHost(req) || origin === config.appUrl;
}
