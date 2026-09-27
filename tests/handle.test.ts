import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFromMetadata, normalizeHandle } from "../lib/handle.ts";

test("normalizeHandle accepts @handles and x.com / twitter.com links", () => {
  assert.equal(normalizeHandle("@Moon_Whale"), "moon_whale");
  assert.equal(normalizeHandle("https://x.com/MoonWhale?s=20"), "moonwhale");
  assert.equal(normalizeHandle("twitter.com/abc/status/1"), "abc");
  assert.equal(normalizeHandle("way_too_long_handle_here"), null);
  assert.equal(normalizeHandle("bad-handle"), null);
});

test("handleFromMetadata prefers explicit fields, then the description marker", () => {
  assert.equal(handleFromMetadata({ feeRecipient: "@alice", twitter: "@bob" }), "alice");
  assert.equal(handleFromMetadata({ twitter: "https://x.com/bob" }), "bob");
  assert.equal(handleFromMetadata({ description: "gm. fees to @carol forever" }), "carol");
  assert.equal(handleFromMetadata({ description: "fees: @dave" }), "dave");
  assert.equal(handleFromMetadata({ description: "no handle here @eve" }), null);
});

test("fee handle is found wherever the launchpad put the bio", async () => {
  const { feeHandleFromMetadata } = await import("../lib/handle.ts");
  assert.equal(feeHandleFromMetadata({ name: "X", properties: { bio: "gm. fees @natan_benish" } } as never, ["uselongpaid"]), "natan_benish");
  assert.equal(feeHandleFromMetadata({ extensions: [{ text: "fees: @Alice" }] } as never), "alice");
  assert.equal(feeHandleFromMetadata({ description: "no handle here" }), null);
});
