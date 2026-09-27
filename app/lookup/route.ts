import { normalizeHandle } from "@/lib/handle.ts";
import { redirectTo } from "@/lib/http.ts";
import { isTokenAddress, normalizeAddress } from "@/lib/address.ts";

export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (isTokenAddress(q)) return redirectTo(`/token/${normalizeAddress(q)}`, 307);
  const handle = normalizeHandle(q);
  if (handle) return redirectTo(`/profile/${handle}`, 307);
  return redirectTo(`/?notfound=${encodeURIComponent(q)}`, 307);
}
