import { createHmac } from "node:crypto";
import type { PayoutProvider, PayoutRequest, PayoutResult } from "./types.ts";

/**
 * Sends each payout to an operator-run service that pays the X account (for example through X Money).
 *
 * Request: POST JSON {id, idempotencyKey, handle, wallet, amountMicros, amountUsd, currency}
 *   headers  x-feeroute-timestamp: <unix ms>
 *            x-feeroute-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<body>" with the shared secret>
 * Response: 200 {"status": "sent", "ref": "..."}    -> payout marked paid
 *           200 {"status": "failed", "reason": "..."} or any 4xx -> marked failed, money returns to the balance
 *           5xx or network error -> left queued and retried next cycle
 *
 * The same payout can be retried, so the receiver must treat `idempotencyKey` as unique and never pay it twice.
 */
export class WebhookPayoutProvider implements PayoutProvider {
  readonly name = "webhook";
  readonly retrySafe = true;

  private url: string;
  private secret: string;
  private fetchImpl: typeof fetch;

  constructor(url: string, secret: string, fetchImpl: typeof fetch = fetch) {
    if (!url) throw new Error("PAYOUT_WEBHOOK_URL is not set");
    if (!secret) throw new Error("PAYOUT_WEBHOOK_SECRET is not set");
    this.url = url;
    this.secret = secret;
    this.fetchImpl = fetchImpl;
  }

  async send(p: PayoutRequest): Promise<PayoutResult | null> {
    const body = JSON.stringify({
      id: p.id,
      idempotencyKey: `payout-${p.id}`,
      handle: p.handle,
      wallet: p.wallet,
      amountMicros: p.amountMicros,
      amountUsd: (p.amountMicros / 1_000_000).toFixed(2),
      currency: "USD",
    });
    const ts = String(Date.now());
    const sig = createHmac("sha256", this.secret).update(`${ts}.${body}`).digest("hex");

    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-feeroute-timestamp": ts, "x-feeroute-signature": `sha256=${sig}` },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status >= 500) throw new Error(`payout service error ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { status?: string; ref?: string; reason?: string };
    if (res.ok && data.status === "sent") return { ok: true, ref: data.ref ?? "" };
    if (res.ok && data.status !== "failed") throw new Error(`unexpected payout response: ${JSON.stringify(data)}`);
    return { ok: false, reason: data.reason ?? `rejected (${res.status})` };
  }
}
