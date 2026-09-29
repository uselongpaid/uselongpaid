import { NextResponse } from "next/server";
import { config, databaseSettings } from "@/lib/config.ts";
import { db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

/** Which build is live and whether the database answers, for checking a deploy. */
export async function GET() {
  let database: string;
  try {
    await (await db()).prepare("SELECT 1").get();
    database = "ok";
  } catch (e) {
    database = `error: ${(e as Error).message}`;
  }
  return NextResponse.json({
    app: config.appName,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.COMMIT_REF || process.env.GIT_COMMIT_SHA || "unknown",
    host: process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME ? "netlify" : process.env.RAILWAY_ENVIRONMENT ? "railway" : "node",
    database,
    databaseSettings: databaseSettings(),
    chainId: config.chain.id,
    node: process.version,
  });
}
