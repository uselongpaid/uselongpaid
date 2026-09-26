import { NextResponse } from "next/server";
import { config } from "@/lib/config.ts";
import { sameOrigin } from "@/lib/auth.ts";
import { ADMIN_COOKIE } from "@/lib/admin.ts";

export function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const res = NextResponse.redirect(`${config.appUrl}/admin/login`, 303);
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
