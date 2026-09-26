import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Small signed-cookie helpers: value = base64url(json) + "." + base64url(hmac).

export function sign(payload: object, secret: string): string {
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** Returns the payload if the signature is valid and `exp` (ms) hasn't passed. */
export function verify<T extends { exp: number }>(token: string | undefined, secret: string, now = Date.now()): T | null {
  if (!token || !secret) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    return typeof payload.exp === "number" && payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

