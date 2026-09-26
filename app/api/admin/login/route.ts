import { NextResponse } from "next/server";
import { isHttps, redirectTo } from "@/lib/http.ts";
import { sameOrigin } from "@/lib/auth.ts";
import { ADMIN_COOKIE, ADMIN_TTL_MS, adminEnabled, adminToken, passwordMatches } from "@/lib/admin.ts";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!adminEnabled()) return redirectTo("/admin/login?error=disabled");
  const form = await req.formData();
  if (!passwordMatches(String(form.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return redirectTo("/admin/login?error=wrong");
  }
  const res = redirectTo("/admin");
  res.headers.append(
    "set-cookie",
    `${ADMIN_COOKIE}=${adminToken()}; Path=/; Max-Age=${ADMIN_TTL_MS / 1000}; HttpOnly; SameSite=Strict${isHttps(req) ? "; Secure" : ""}`,
  );
  return res;
}
