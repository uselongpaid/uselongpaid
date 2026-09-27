import type { Db } from "./db.ts";
import type { LaunchRow } from "./launcher.ts";

/** Coins launched from this site that made it on chain, newest first. */
export function listCoins(db: Db, opts: { limit?: number; q?: string } = {}): LaunchRow[] {
  const limit = opts.limit ?? 60;
  if (opts.q) {
    const like = `%${opts.q.toLowerCase()}%`;
    return db
      .prepare(
        `SELECT * FROM site_launches WHERE status = 'completed'
         AND (lower(name) LIKE ? OR lower(symbol) LIKE ? OR lower(coalesce(handle,'')) LIKE ? OR mint = ?)
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(like, like, like, opts.q, limit) as LaunchRow[];
  }
  return db.prepare("SELECT * FROM site_launches WHERE status = 'completed' ORDER BY created_at DESC LIMIT ?").all(limit) as LaunchRow[];
}

export function getCoin(db: Db, mint: string): LaunchRow | null {
  return (db.prepare("SELECT * FROM site_launches WHERE mint = ? AND status IN ('submitted','completed')").get(mint) as LaunchRow | undefined) ?? null;
}

/** Launches sent but not yet seen confirmed (the launcher's page was closed before it finished). */
export function pendingCoins(db: Db, olderThanMs: number, now = Date.now()): LaunchRow[] {
  return db.prepare("SELECT * FROM site_launches WHERE status = 'submitted' AND updated_at < ? ORDER BY created_at DESC LIMIT 10").all(now - olderThanMs) as LaunchRow[];
}

/** Logo URL for a coin: uploaded logos are served by this site. */
export function coinImage(r: LaunchRow): string {
  return r.image.startsWith("data:") ? `/api/launch/${r.id}/image` : r.image;
}

export function coinSocials(r: LaunchRow): { twitter?: string; website?: string; telegram?: string } {
  try {
    return JSON.parse(r.socials);
  } catch {
    return {};
  }
}

/** The bio without the trailing "fees @handle" line, which the page shows on its own. */
export function coinBio(r: LaunchRow): string {
  return r.handle ? r.description.replace(/\s*fees @\w+\s*$/i, "").trim() : r.description;
}
