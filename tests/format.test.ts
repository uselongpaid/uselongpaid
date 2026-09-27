import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtUsd, groupInt } from "../lib/format.ts";

test("fmtUsd is the same everywhere: compact above $10K, precise below", () => {
  assert.equal(fmtUsd(null), "—");
  assert.equal(fmtUsd(42_100), "$42.1K");
  assert.equal(fmtUsd(15_234), "$15.23K");
  assert.equal(fmtUsd(123_456_789), "$123.46M");
  assert.equal(fmtUsd(2_500_000_000), "$2.5B");
  assert.equal(fmtUsd(9_876), "$9,876.00");
  assert.equal(fmtUsd(42_100, false), "$42,100.00");
  assert.equal(fmtUsd(1.5), "$1.50");
  assert.equal(fmtUsd(0.5), "$0.5");
  assert.equal(fmtUsd(0.0000421), "$0.0000421");
  assert.equal(groupInt(1234567), "1,234,567");
});
