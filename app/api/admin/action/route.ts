import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { config } from "@/lib/config.ts";
import { sameOrigin } from "@/lib/auth.ts";
import { isAdmin } from "@/lib/admin.ts";
import { normalizeHandle } from "@/lib/handle.ts";
import { formatUsd, parseUsd } from "@/lib/money.ts";
import { markAllBurnsDone, recordClaim, resetPayoutAttempt, setOptOut, settlePayout, upsertToken } from "@/lib/ledger.ts";
import { getToken } from "@/lib/queries.ts";
import { distributePending, type DistributionReport } from "@/lib/distribute.ts";
import { db, ledgerOptions, manualSource, payoutProvider } from "@/lib/server.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

function back(params: Record<string, string>) {
  return NextResponse.redirect(`${config.appUrl}/admin?${new URLSearchParams(params)}`, 303);
}

function summarize(r: DistributionReport): string {
  const parts = [`${r.sent.length} payout(s) sent`];
  if (r.waiting) parts.push(`${r.waiting} waiting for a wallet`);
  if (r.failed.length) parts.push(`${r.failed.length} failed`);
  if (r.needsReview.length) parts.push(`${r.needsReview.length} need review`);
  if (r.errors.length) parts.push(`errors: ${r.errors.map((e) => `#${e.id} ${e.message}`).join("; ")}`);
  return parts.join(", ");
}

/** Every admin form posts here with an `action` field. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  if (!(await isAdmin())) return NextResponse.redirect(`${config.appUrl}/admin/login`, 303);
  const f = await req.formData();
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const d = db();

  try {
    switch (s("action")) {
      case "add-token": {
        const address = s("address");
        if (!isAddress(address)) return back({ err: "Token address isn't valid." });
        const handle = normalizeHandle(s("handle"));
        if (!handle) return back({ err: "X handle isn't valid." });
        let name = s("name");
        let symbol = s("symbol").replace(/^\$/, "");
        if (!name || !symbol) {
          const info = await manualSource().tokenInfo(address);
          if (!info) return back({ err: "Couldn't read the token from chain. Enter the name and symbol." });
          name ||= info.name;
          symbol ||= info.symbol;
        }
        const existing = getToken(d, address);
        upsertToken(d, {
          address: getAddress(address),
          chainId: config.long.chainId,
          name,
          symbol,
          image: existing?.image ?? null,
          handle,
          creator: existing?.creator ?? null,
          launchedAt: existing?.launched_at ?? Date.now(),
        });
        return back({ msg: `${existing ? "Updated" : "Added"} $${symbol}, fees go to @${handle}.` });
      }

      case "record-claim": {
        const token = getToken(d, s("token"));
        if (!token) return back({ err: "Pick a token." });
        const micros = parseUsd(s("amount"));
        if (!micros) return back({ err: "Enter the claimed amount in USD, for example 125.40." });
        const txHash = s("tx").toLowerCase();
        if (!TX_RE.test(txHash)) return back({ err: "Enter the claim transaction hash (0x + 64 hex characters)." });
        const ok = await manualSource().txSucceeded(txHash);
        if (ok === false) return back({ err: "That transaction wasn't found on chain or it failed." });

        const { payoutId } = recordClaim(d, ledgerOptions(), token.address, micros, txHash, s("note") || null);
        const dist = await distributePending(d, payoutProvider());
        const milestone = payoutId ? ` Milestone reached for @${token.handle}.` : "";
        return back({ msg: `Recorded ${formatUsd(micros)} for $${token.symbol}.${milestone} ${summarize(dist)}.` });
      }

      case "distribute": {
        return back({ msg: summarize(await distributePending(d, payoutProvider())) + "." });
      }

      case "mark-paid": {
        const id = Number(s("id"));
        const ref = s("ref");
        if (!ref) return back({ err: "Enter the payment reference or tx hash." });
        settlePayout(d, id, { ok: true, ref });
        return back({ msg: `Payout #${id} marked paid.` });
      }

      case "mark-failed": {
        const id = Number(s("id"));
        settlePayout(d, id, { ok: false, reason: s("reason") || "marked failed by admin" });
        return back({ msg: `Payout #${id} marked failed; the amount is back in the balance.` });
      }

      case "reset-attempt": {
        const id = Number(s("id"));
        resetPayoutAttempt(d, id);
        return back({ msg: `Payout #${id} will be retried on the next distribution.` });
      }

      case "burns-done": {
        const txHash = s("tx");
        if (!TX_RE.test(txHash)) return back({ err: "Enter the buyback-and-burn transaction hash." });
        const n = markAllBurnsDone(d, txHash);
        return back({ msg: `${n} pending burn(s) marked done.` });
      }

      case "opt-out": {
        const handle = normalizeHandle(s("handle"));
        if (!handle) return back({ err: "X handle isn't valid." });
        const out = s("value") === "1";
        setOptOut(d, handle, out);
        return back({ msg: `@${handle} ${out ? "opted out" : "opted back in"}.` });
      }

      default:
        return back({ err: "Unknown action." });
    }
  } catch (e) {
    return back({ err: (e as Error).message });
  }
}
