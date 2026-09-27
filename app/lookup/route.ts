import { config } from "@/lib/config.ts";
import { normalizeHandle } from "@/lib/handle.ts";
import { redirectTo } from "@/lib/http.ts";
import { isSolanaAddress, isTokenAddress, normalizeAddress } from "@/lib/address.ts";
import { getCoin } from "@/lib/coins.ts";
import { db } from "@/lib/server.ts";

export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (isSolanaAddress(q) && (q === config.projectCoin.mint || getCoin(db(), q))) return redirectTo(`/coin/${q}`, 307);
  if (isTokenAddress(q)) return redirectTo(`/token/${normalizeAddress(q)}`, 307);
  const handle = normalizeHandle(q);
  if (handle) return redirectTo(`/profile/${handle}`, 307);
  return redirectTo(`/?notfound=${encodeURIComponent(q)}`, 307);
}
