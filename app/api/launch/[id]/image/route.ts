import { db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

/** Serves a logo uploaded with a launch. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const row = db().prepare("SELECT image FROM site_launches WHERE id = ? AND mint IS NOT NULL").get((await params).id) as { image: string } | undefined;
  const m = row?.image.match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/);
  if (!m) return new Response("not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" },
  });
}
