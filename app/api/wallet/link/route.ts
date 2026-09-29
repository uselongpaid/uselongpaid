import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http, isAddress, verifyMessage } from "viem";
import { config } from "@/lib/config.ts";
import { sameOrigin } from "@/lib/auth.ts";
import { normalizeHandle } from "@/lib/handle.ts";
import { createLinkRequest } from "@/lib/ledger.ts";
import { linkMessage, parseTweetUrl, verificationCode } from "@/lib/walletlink.ts";
import { db } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

type Body = { handle?: string; wallet?: string; issuedAt?: string; signature?: string; tweetUrl?: string };

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** Submits a signed request to link an X handle to the connecting wallet. An admin approves it after checking the X post. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("bad origin", 403);
  const b = ((await req.json().catch(() => null)) ?? {}) as Body;

  const handle = b.handle ? normalizeHandle(b.handle) : null;
  if (!handle) return bad("Enter a valid X handle.");
  if (!b.wallet || !isAddress(b.wallet)) return bad("Connect a wallet first.");
  const wallet = getAddress(b.wallet);
  if (!b.signature || !/^0x[0-9a-fA-F]+$/.test(b.signature)) return bad("Sign the message in your wallet.");
  const issued = Date.parse(b.issuedAt ?? "");
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > config.linkMaxAgeMs) {
    return bad("The signature expired. Sign again.");
  }
  const tweetUrl = parseTweetUrl(b.tweetUrl ?? "", handle);
  if (!tweetUrl) return bad(`Paste the link to your post from @${handle} (x.com/${handle}/status/…).`);

  const message = linkMessage({ appName: config.appName, handle, wallet, chainId: config.chain.id, issuedAt: b.issuedAt! });
  const signature = b.signature as `0x${string}`;
  let valid = false;
  try {
    // Through the RPC so smart-contract wallets (ERC-1271) verify too; fall back to plain ECDSA.
    valid = await createPublicClient({ transport: http(config.long.rpcUrl) }).verifyMessage({ address: wallet, message, signature });
  } catch {
    valid = await verifyMessage({ address: wallet, message, signature }).catch(() => false);
  }
  if (!valid) return bad("The signature doesn't match this wallet.");

  const code = verificationCode(signature);
  const id = await createLinkRequest((await db()), { handle, wallet, message, signature, code, tweetUrl });
  return NextResponse.json({ ok: true, id, code, status: "pending" });
}
