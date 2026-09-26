import "server-only";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";
import { sign, verify } from "./session.ts";
import { authorized } from "./server.ts";

export const ADMIN_COOKIE = "lp_admin";
export const ADMIN_TTL_MS = 12 * 3_600_000;

export function adminEnabled(): boolean {
  return Boolean(config.adminPassword && config.sessionSecret);
}

export function passwordMatches(given: string): boolean {
  if (!config.adminPassword) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(config.adminPassword);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminToken(): string {
  return sign({ role: "admin", exp: Date.now() + ADMIN_TTL_MS }, config.sessionSecret);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verify<{ role: string; exp: number }>(jar.get(ADMIN_COOKIE)?.value, config.sessionSecret)?.role === "admin";
}

/** Admin cookie (browser) or CRON_SECRET bearer token (scripts). */
export async function adminAllowed(req: Request): Promise<boolean> {
  return authorized(req) || (await isAdmin());
}
