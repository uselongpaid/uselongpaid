import { config } from "./config.ts";

/** Rejects cross-site form posts: the Origin header must match APP_URL when present. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin === null || origin === config.appUrl;
}
