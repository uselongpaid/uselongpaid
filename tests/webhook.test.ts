import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { WebhookPayoutProvider } from "../lib/payouts/webhook.ts";

function fakeFetch(status: number, body: unknown, seen: { req?: RequestInit } = {}) {
  return (async (_url: string, init: RequestInit) => {
    seen.req = init;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

const payout = { id: 7, handle: "alice", amountMicros: 12_340_000, wallet: null };

test("signs the request body with the shared secret", async () => {
  const seen: { req?: RequestInit } = {};
  const p = new WebhookPayoutProvider("https://pay.example/x", "s3cret", fakeFetch(200, { status: "sent", ref: "tx1" }, seen));
  assert.deepEqual(await p.send(payout), { ok: true, ref: "tx1" });

  const headers = seen.req!.headers as Record<string, string>;
  const body = seen.req!.body as string;
  const expected = createHmac("sha256", "s3cret").update(`${headers["x-feeroute-timestamp"]}.${body}`).digest("hex");
  assert.equal(headers["x-feeroute-signature"], `sha256=${expected}`);
  const json = JSON.parse(body);
  assert.equal(json.idempotencyKey, "payout-7");
  assert.equal(json.amountUsd, "12.34");
});

test("maps failures: explicit fail and 4xx fail the payout, 5xx is retried", async () => {
  const failed = new WebhookPayoutProvider("u", "s", fakeFetch(200, { status: "failed", reason: "no X Money" }));
  assert.deepEqual(await failed.send(payout), { ok: false, reason: "no X Money" });

  const rejected = new WebhookPayoutProvider("u", "s", fakeFetch(422, {}));
  assert.deepEqual(await rejected.send(payout), { ok: false, reason: "rejected (422)" });

  const down = new WebhookPayoutProvider("u", "s", fakeFetch(503, {}));
  await assert.rejects(down.send(payout), /503/);

  const weird = new WebhookPayoutProvider("u", "s", fakeFetch(200, { ok: 1 }));
  await assert.rejects(weird.send(payout), /unexpected/);
});
