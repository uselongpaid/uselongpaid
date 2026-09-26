import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { sameOrigin } from "@/lib/auth.ts";
import { ADMIN_COOKIE, ADMIN_TTL_MS, adminEnabled, adminToken, passwordMatches } from "@/lib/admin.ts";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!adminEnabled()) return NextResponse.redirect(`${config.appUrl}/admin/login?error=disabled`, 303);
  const form = await req.formData();
  if (!passwordMatches(String(form.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.redirect(`${config.appUrl}/admin/login?error=wrong`, 303);
  }
  const res = NextResponse.redirect(`${config.appUrl}/admin`, 303);
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    secure: config.appUrl.startsWith("https://"),
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_TTL_MS / 1000,
  });
  return res;
}
