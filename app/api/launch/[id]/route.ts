import { NextResponse } from "next/server";
import { jsonError, launcher, publicLaunch } from "@/lib/launch-api.ts";

export const dynamic = "force-dynamic";

/** Current state of a launch; asks stonkfun when it's still in flight. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const row = await launcher().refresh((await params).id);
    if (!row) return NextResponse.json({ error: "Launch not found." }, { status: 404 });
    return NextResponse.json(publicLaunch(row));
  } catch (e) {
    return jsonError(e);
  }
}
