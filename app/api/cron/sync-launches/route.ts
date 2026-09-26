import { NextResponse } from "next/server";
import { authorized } from "@/lib/server.ts";
import { runLaunchSync } from "@/lib/detect.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scans long.xyz for new launches routed to LongPaid. The app also does this on its own every 2 minutes. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runLaunchSync());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
