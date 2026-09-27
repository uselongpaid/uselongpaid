import { NextResponse } from "next/server";
import { db } from "@/lib/server.ts";
import { metadataJson, type LaunchRow } from "@/lib/launcher.ts";
import { publicOrigin } from "@/lib/launch-api.ts";

export const dynamic = "force-dynamic";

/** Token metadata (name, symbol, description, image, links) that the mint's URI points at. Wallets and explorers read it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const row = db().prepare("SELECT * FROM site_launches WHERE id = ?").get(id) as LaunchRow | undefined;
  if (!row || !row.mint) return NextResponse.json({ error: "not found" }, { status: 404 });
  const image = row.image.startsWith("data:") ? `${publicOrigin(req)}/api/launch/${id}/image` : row.image;
  return NextResponse.json(metadataJson(row, image), { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
