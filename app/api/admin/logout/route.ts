import { NextResponse } from "next/server";
import { redirectTo } from "@/lib/http.ts";
import { sameOrigin } from "@/lib/auth.ts";
import { ADMIN_COOKIE } from "@/lib/admin.ts";

export function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  const res = redirectTo("/admin/login");
  res.headers.append("set-cookie", `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
  return res;
}
