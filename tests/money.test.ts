import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUsd, splitClaim, tokenAmountToMicros } from "../lib/money.ts";

test("splitClaim gives 80/20 and sends rounding dust to the burn", async () => {
  assert.deepEqual(splitClaim(1_000_000, 8000), { recipient: 800_000, burn: 200_000 });
  assert.deepEqual(splitClaim(7, 8000), { recipient: 5, burn: 2 });
  assert.deepEqual(splitClaim(0, 8000), { recipient: 0, burn: 0 });
});

test("splitClaim rejects bad input", async () => {
  assert.throws(() => splitClaim(-1, 8000));
  assert.throws(() => splitClaim(1.5, 8000));
  assert.throws(() => splitClaim(10, 10_001));
});

test("tokenAmountToMicros converts base units at a USD price", async () => {
  assert.equal(tokenAmountToMicros(10n ** 18n, 18, 1), 1_000_000);
  assert.equal(tokenAmountToMicros(5n * 10n ** 17n, 18, 180.25), 90_125_000);
  assert.equal(tokenAmountToMicros(2_500_000n, 6, 1), 2_500_000);
});

test("formatUsd", async () => {
  assert.equal(formatUsd(1_234_560_000), "$1,234.56");
});
