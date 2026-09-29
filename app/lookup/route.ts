import { normalizeHandle } from "@/lib/handle.ts";
import { redirectTo } from "@/lib/http.ts";
import { config } from "@/lib/config.ts";

export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) return redirectTo(`/token/${q.toLowerCase()}`, 307);
  const handle = normalizeHandle(q);
  if (handle) return redirectTo(`/profile/${handle}`, 307);
  return redirectTo(`/?notfound=${encodeURIComponent(q)}`, 307);
}
