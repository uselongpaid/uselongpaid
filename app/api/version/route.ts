import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";

export const dynamic = "force-dynamic";

/** Which build is live. Railway sets RAILWAY_GIT_COMMIT_SHA on every deploy. */
export function GET() {
  return NextResponse.json({
    app: config.appName,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "unknown",
    chainId: config.chain.id,
    node: process.version,
  });
}
