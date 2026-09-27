import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { StonkfunClient, type Pair } from "@/lib/stonkfun.ts";
import { jsonError } from "@/lib/launch-api.ts";

export const dynamic = "force-dynamic";

let cache: { at: number; pairs: Pair[] } | null = null;

/** Quote assets a new stonkfun launch can pair against, cached for a minute. */
export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), pairs: await new StonkfunClient(config.launch.apiBase).pairs() };
    return NextResponse.json({ pairs: cache.pairs });
  } catch (e) {
    return jsonError(e);
  }
}
